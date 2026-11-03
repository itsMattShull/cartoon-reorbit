import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickGoalCardIdx, assignRandomGoals, goalCardFor, determineWinner, REAL_COLORS
} from '../server/utils/ogGtoonEngine.js'
import {
  initHands, publicMatchView, enterColorPhase, submitColor, resolveColorPhase, autoSilverColor,
  expirePhase, checkMatchEnd, runFinalBoardResolution
} from '../server/utils/ogGtoonMatchCore.js'

const card = (color, i = 0) => ({
  ctoonId: `c${i}${color}`, name: `${color} ${i}`, assetPath: '/x.png', characters: [], color, value: 5,
  type1: null, type2: null, type3: null, group: null, isSlam: false, effect: null, position: i
})
const deckOf = (colors) => colors.map((c, i) => card(c, i))

test('goal cards are never Black or Silver', () => {
  const deck = deckOf(['BLACK', 'SILVER', 'RED', 'BLACK', 'SILVER', 'BLUE', 'BLACK', 'SILVER', 'BLACK', 'SILVER', 'BLACK', 'SILVER'])
  for (let n = 0; n < 50; n++) assert.ok(['RED', 'BLUE'].includes(deck[pickGoalCardIdx(deck, Math.random)].color))
})

test('a deck with no eligible goal card has no target colour and no goal card', () => {
  const deck = deckOf(Array(12).fill('SILVER'))
  assert.equal(pickGoalCardIdx(deck), null)
  const m = assignRandomGoals({ deckOrder: [deck, deck] }, () => 0)
  assert.deepEqual(m.goalCardIdx, [null, null])
  assert.deepEqual(m.goalColor, ['BLACK', 'BLACK'])
  assert.equal(goalCardFor(m, 0), null)
})

test('determineWinner counts a Silver card as its owner\'s picked colour', () => {
  const r = (color, finalValue = 5) => ({ color, finalValue, cancelled: false })
  const base = {
    player1GoalColor: 'RED', player2GoalColor: 'BLUE',
    player1Revealed: [r('RED'), r('SILVER'), r('SILVER')],
    player2Revealed: [r('BLUE'), r('BLUE'), r('RED')]
  }
  // Silver stays colourless until picked: p1 has 1 Red to p2's 1 and 0 Blue to 2, so nobody leads both -> points
  // (15 each, a tie), never a color win.
  assert.notEqual(determineWinner(base).reason, 'both_colors')
  assert.equal(determineWinner(base).winner, null)
  // p1 holds more Red (2 vs 1); a Blue pick gives them more Blue (3 vs 1) too, so they win outright.
  const sides = {
    player1GoalColor: 'RED', player2GoalColor: 'BLUE',
    player1Revealed: [r('RED'), r('RED'), r('SILVER'), r('SILVER'), r('SILVER')],
    player2Revealed: [r('BLUE'), r('RED')]
  }
  const picked = determineWinner({ ...sides, player1SilverColor: 'BLUE' })
  assert.equal(picked.winner, 'player1')
  assert.equal(picked.reason, 'both_colors')
  assert.notEqual(determineWinner(sides).reason, 'both_colors')
})

function silverMatch() {
  const mk = (colors) => deckOf(colors)
  const m = initHands({
    id: 't', players: ['a', 'b'], usernames: ['A', 'B'],
    deckOrder: [mk(['SILVER', 'RED', ...Array(10).fill('RED')]), mk(Array(12).fill('BLUE'))],
    goalColor: ['RED', 'BLUE'], goalCardIdx: [1, 0], stake: [0, 0]
  }, () => 0.5)
  const entry = (c, slot) => ({ ...c, deckIdx: slot, baseColor: c.color, baseValue: c.value, finalValue: c.value, cancelled: false, round: 1, slot })
  m.revealed = [
    [entry(card('SILVER', 0), 1), entry(card('RED', 1), 2), entry(card('RED', 2), 3)],
    [entry(card('BLUE', 0), 1), entry(card('BLUE', 1), 2), entry(card('BLUE', 2), 3)]
  ]
  m.currentRound = 3
  return m
}

test('colour phase only opens for a board with Silver, runs once, and is secret until both are done', () => {
  const m = silverMatch()
  assert.equal(enterColorPhase(m), true)
  assert.equal(m.phase, 'color')
  assert.deepEqual(m.colorReady, [false, true]) // the Silver-free side is done up front
  assert.equal(submitColor(m, 0, { color: 'BLACK' }).ok, false)
  assert.equal(submitColor(m, 0, { color: 'SILVER' }).ok, false)
  assert.equal(submitColor(m, 0, { color: 'RED' }).ok, true)
  assert.equal(submitColor(m, 0, { color: 'BLUE' }).ok, false)
  assert.equal(publicMatchView(m, 'b').opponent.silverColor, null)
  assert.equal(resolveColorPhase(m), true)
  assert.equal(publicMatchView(m, 'b').opponent.silverColor, 'RED')
  assert.equal(m.phase, 'play')
  assert.equal(enterColorPhase(m), false)
})

test('no colour phase when nobody has a Silver card', () => {
  const m = silverMatch()
  m.revealed[0] = m.revealed[0].filter(r => r.baseColor !== 'SILVER')
  assert.equal(enterColorPhase(m), false)
  assert.equal(m.phase, 'play')
})

test('timeout picks the best colour; the pick decides the goal-colour count', () => {
  const m = silverMatch()
  enterColorPhase(m)
  assert.equal(autoSilverColor(m, 0), 'RED')
  expirePhase(m)
  assert.equal(m.colorReady[0], true)
  resolveColorPhase(m)
  assert.equal(m.silverColor[0], 'RED')
  const end = checkMatchEnd(m)
  assert.equal(m.revealed[0][0].color, 'RED')
  assert.ok(end || m.currentRound >= 3)
})

test('a Silver card turned Green counts as Green for powers like "+2 to all Green"', () => {
  const greenBuff = [{
    trigger: 'onReveal',
    target: { selector: 'allMatching', scope: 'own', filters: [{ by: 'color', value: 'GREEN' }] },
    action: { type: 'modifyValue', operation: 'add', amount: 2 }
  }]
  const m = silverMatch()
  m.goalColor = ['GREEN', 'BLUE']
  const entry = (c, slot, extra = {}) => ({ ...c, deckIdx: slot, baseColor: c.color, baseValue: c.value, finalValue: c.value, cancelled: false, round: 1, slot, ...extra })
  m.revealed = [
    [entry(card('GREEN', 0), 1, { effect: greenBuff }), entry(card('SILVER', 1), 2)],
    [entry(card('BLUE', 2), 1), entry(card('BLUE', 3), 2)]
  ]

  // Picked Blue -> it is Blue when powers resolve, so the Green buff misses it.
  m.silverColor = ['BLUE', null]
  assert.deepEqual(runFinalBoardResolution(m).final.player1.revealed.map(r => r.finalValue), [7, 5])

  // Picked Green -> it is Green when powers resolve, so it gets the +2 as well.
  m.silverColor = ['GREEN', null]
  const { final } = runFinalBoardResolution(m)
  assert.deepEqual(final.player1.revealed.map(r => r.finalValue), [7, 7])
  assert.equal(m.revealed[0][1].color, 'GREEN')

  // And an unpicked side's automatic choice sees the buff too.
  m.silverColor = [null, null]
  assert.equal(autoSilverColor(m, 0), 'GREEN')
})
