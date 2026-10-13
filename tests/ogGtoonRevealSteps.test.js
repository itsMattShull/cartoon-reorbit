import test from 'node:test'
import assert from 'node:assert/strict'
import { slotsForRound } from '../server/utils/ogGtoonEngine.js'
import {
  initHands, placeCard, revealPlacedCards, advanceRound, submitDiscard, resolveDiscardPhase, buildRevealSteps, runFinalBoardResolution,
  publicMatchView, extendDeadlineForReveal, recordSwapChoice, resolveSwapPhase, checkMatchEnd
} from '../server/utils/ogGtoonMatchCore.js'
import { revealDurationMs, revealStepMs, REVEAL_FIRST_MS, REVEAL_CARD_MS, REVEAL_EFFECTS_MS, REVEAL_QUIET_MS } from '../utils/ogGtoonReveal.js'

const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE', 'PINK', 'RED', 'BLUE', 'GREEN', 'BLACK', 'SILVER']
function makeDeck({ goal = 'BLACK', values, effect = null, prefix = '' } = {}) {
  const vals = values || [9, 1, 5, 7, 2, 8, 3, 6, 4, 5, 2, 1]
  return Array.from({ length: 12 }, (_, i) => ({
    ctoonId: `${prefix}c${i}`, name: `${prefix}Card ${i}`, assetPath: `/c${i}.png`, characters: [],
    color: i === 11 ? goal : COLORS[i], value: vals[i],
    type1: null, type2: null, type3: null, group: null, isSlam: false, effect, position: i
  }))
}
function seeded(seed = 1) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
function freshMatch(deckA, deckB) {
  return initHands({
    id: 'm1', players: ['a', 'b'], usernames: ['A', 'B'], deckOrder: [deckA, deckB],
    goalColor: [deckA[11].color, deckB[11].color], stake: [0, 0]
  }, seeded(5))
}
function autoPlay(m, i) {
  const slots = slotsForRound(m.currentRound)
  m.hand[i].slice(0, slots.length).forEach((cardIdx, k) => assert.equal(placeCard(m, i, { cardIdx, slot: slots[k] }).ok, true))
  m.ready[i] = true
}
const buff = (n) => [{ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: n } }]
const boostOpp = [{ trigger: 'onReveal', target: { selector: 'allOwnRevealed' }, action: { type: 'modifyValue', operation: 'add', amount: 1 } }]

test('steps alternate player 1 / player 2 and climb through the slots in order', () => {
  const m = freshMatch(makeDeck({ prefix: 'a' }), makeDeck({ prefix: 'b' }))
  autoPlay(m, 0); autoPlay(m, 1)
  const { steps } = revealPlacedCards(m)
  assert.equal(steps.length, 8)
  assert.deepEqual(steps.map(s => [s.side, s.slot]), [[0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4]])
})

test('each step only contains the cards revealed so far, and totals match their values', () => {
  const m = freshMatch(makeDeck({ prefix: 'a' }), makeDeck({ prefix: 'b' }))
  autoPlay(m, 0); autoPlay(m, 1)
  const { steps, before } = revealPlacedCards(m)
  assert.equal(before.cards.length, 0)
  steps.forEach((s, i) => {
    assert.equal(s.cards.length, i + 1)
    const sum = [0, 1].map(side => s.cards.filter(c => c.side === side).reduce((a, c) => a + c.finalValue, 0))
    assert.deepEqual(s.totals, sum)
  })
})

test('a revealed power changes OTHER cards that are already on the board, at the step it lands', () => {
  // Player 2's cards each give every one of their own revealed cards +1 once they are on the board.
  const m = freshMatch(makeDeck({ prefix: 'a' }), makeDeck({ prefix: 'b', effect: boostOpp }))
  autoPlay(m, 0); autoPlay(m, 1)
  const { steps } = revealPlacedCards(m)
  const p2First = steps[1]                       // player 2's slot-1 card has landed
  const p2Cards = (s) => s.cards.filter(c => c.side === 1).sort((a, b) => a.slot - b.slot)
  const baseOf = (slot) => m.revealed[1].find(r => r.slot === slot).baseValue
  assert.equal(p2Cards(p2First)[0].finalValue, baseOf(1) + 1)          // lifted by itself
  const afterSecond = steps[3]                                           // player 2's slot-2 card landed
  const [c1, c2] = p2Cards(afterSecond)
  assert.equal(c1.finalValue, baseOf(1) + 2)                             // slot 1 changed again because slot 2 arrived
  assert.equal(c2.finalValue, baseOf(2) + 2)
  assert.equal(steps[3].changed, true)
  assert.equal(steps[0].changed, false)                                  // player 1's plain card changes nothing
})

test('the last step equals the board the final scoring pass produces', () => {
  const m = freshMatch(makeDeck({ prefix: 'a', effect: buff(2) }), makeDeck({ prefix: 'b', effect: boostOpp }))
  autoPlay(m, 0); autoPlay(m, 1)
  const { steps } = revealPlacedCards(m)
  const last = steps.at(-1)
  const { final } = runFinalBoardResolution(m)
  for (const side of [0, 1]) {
    const resolved = final[side === 0 ? 'player1' : 'player2'].revealed
    m.revealed[side].forEach((e, k) => {
      const c = last.cards.find(x => x.side === side && x.slot === e.slot)
      assert.equal(c.finalValue, resolved[k].finalValue)
      assert.equal(c.color, resolved[k].color)
      assert.equal(c.cancelled, !!resolved[k].cancelled)
    })
  }
})

test('building steps never mutates the revealed entries; the public view carries the live board instead', () => {
  const m = freshMatch(makeDeck({ prefix: 'a', effect: buff(3) }), makeDeck({ prefix: 'b' }))
  autoPlay(m, 0); autoPlay(m, 1)
  const { steps } = revealPlacedCards(m)
  assert.ok(steps.at(-1).cards.some(c => c.finalValue !== m.revealed[c.side].find(r => r.slot === c.slot).baseValue))
  assert.equal(m.revealed[0].every(r => r.finalValue === r.baseValue), true)
  const board = publicMatchView(m, 'a').board
  assert.deepEqual(board.totals, steps.at(-1).totals)
  assert.equal(board.cards.length, 8)
})

test('a later round steps through its own cards on top of the earlier board', () => {
  const m = freshMatch(makeDeck({ prefix: 'a', effect: boostOpp }), makeDeck({ prefix: 'b' }))
  autoPlay(m, 0); autoPlay(m, 1)
  revealPlacedCards(m)
  advanceRound(m)                                             // opens the discard phase
  submitDiscard(m, 0, { cardIdxs: [] }); submitDiscard(m, 1, { cardIdxs: [] })
  assert.equal(resolveDiscardPhase(m), true)                  // hands refill to 6, round 2 opens
  autoPlay(m, 0); autoPlay(m, 1)
  const { steps, before } = revealPlacedCards(m)
  assert.equal(before.cards.length, 8)                        // round 1's four-per-side board is already up
  assert.equal(steps.length, 6)                               // slots 5-7, both players
  assert.deepEqual(steps[0].cards.length, 9)
  assert.deepEqual(steps.map(s => [s.side, s.slot]), [[0, 5], [1, 5], [0, 6], [1, 6], [0, 7], [1, 7]])
  // player 1's earlier cards are lifted again when a new player-1 card lands
  const slot1At = (s) => s.cards.find(c => c.side === 0 && c.slot === 1).finalValue
  assert.ok(slot1At(steps[0]) > slot1At(before))
})

test('duplicate gToons knock each other out as soon as the second copy is revealed', () => {
  const deckA = makeDeck({ prefix: 'x' })
  const deckB = makeDeck({ prefix: 'x' })                      // identical ctoon ids on both sides
  const m = freshMatch(deckA, deckB)
  autoPlay(m, 0); autoPlay(m, 1)
  const { steps } = revealPlacedCards(m)
  const dupSteps = steps.filter(s => s.cards.some(c => c.cancelled))
  assert.ok(dupSteps.length > 0)
  // nothing is cancelled while only one copy has been revealed
  const firstOfAny = steps.find(s => s.cards.length === 1)
  assert.equal(firstOfAny.cards.every(c => !c.cancelled), true)
})

test('swap phase: only the swapped cards are stepped, in player order', () => {
  const m = freshMatch(makeDeck({ prefix: 'a' }), makeDeck({ prefix: 'b' }))
  autoPlay(m, 0); autoPlay(m, 1)
  revealPlacedCards(m); advanceRound(m)
  submitDiscard(m, 0, { cardIdxs: [] }); submitDiscard(m, 1, { cardIdxs: [] }); resolveDiscardPhase(m)
  autoPlay(m, 0); autoPlay(m, 1)
  revealPlacedCards(m); advanceRound(m)                       // opens the swap phase
  assert.equal(m.phase, 'swap')
  recordSwapChoice(m, 0, true); recordSwapChoice(m, 1, true)
  const res = resolveSwapPhase(m, seeded(2))
  assert.ok(res)
  assert.ok(res.steps.length > 0)
  assert.ok(res.steps.every(s => s.slot === 7))
  assert.deepEqual(res.steps.map(s => s.side), [...res.steps.map(s => s.side)].sort())
  assert.equal(res.before.cards.length, 12)                   // slot 7 is empty on both sides until the new cards land
})

test('timing helpers: quiet steps are shorter, the next phase clock is pushed out by the animation', () => {
  const quiet = { changed: false }, busy = { changed: true }
  assert.equal(revealStepMs(quiet), REVEAL_CARD_MS + REVEAL_QUIET_MS)
  assert.equal(revealStepMs(busy), REVEAL_CARD_MS + REVEAL_EFFECTS_MS)
  assert.equal(revealDurationMs([]), 0)
  assert.equal(revealDurationMs([quiet, busy]), REVEAL_FIRST_MS + revealStepMs(quiet) + revealStepMs(busy))
  const m = { deadline: 1000 }
  extendDeadlineForReveal(m, [quiet, busy])
  assert.equal(m.deadline, 1000 + revealDurationMs([quiet, busy]))
  const none = { deadline: null }
  extendDeadlineForReveal(none, [busy])
  assert.equal(none.deadline, null)
})
