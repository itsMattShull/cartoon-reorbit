import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickGoalCardIdx, assignRandomGoals, goalCardFor, determineWinner, REAL_COLORS
} from '../server/utils/ogGtoonEngine.js'
import {
  initHands, publicMatchView, enterColorPhase, submitColor, resolveColorPhase, autoSilverColor,
  expirePhase, checkMatchEnd
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

test('a deck with no eligible goal card gets a random real colour and no goal card', () => {
  const deck = deckOf(Array(12).fill('SILVER'))
  assert.equal(pickGoalCardIdx(deck), null)
  const m = assignRandomGoals({ deckOrder: [deck, deck] }, () => 0)
  assert.deepEqual(m.goalCardIdx, [null, null])
  assert.deepEqual(m.goalColor, [REAL_COLORS[0], REAL_COLORS[0]])
  assert.equal(goalCardFor(m, 0), null)
})

test('determineWinner counts a Silver card as its owner\'s picked colour', () => {
  const r = (color, finalValue = 5) => ({ color, finalValue, cancelled: false })
  const base = {
    player1GoalColor: 'RED', player2GoalColor: 'BLUE',
    player1Revealed: [r('RED'), r('SILVER'), r('SILVER')],
    player2Revealed: [r('BLUE'), r('BLUE'), r('RED')]
  }
  // Silver stays colourless until picked: nobody holds more of both colours.
  assert.equal(determineWinner(base).reason, 'tie')
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
