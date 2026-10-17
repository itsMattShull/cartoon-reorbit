import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  buildBotDeck, chooseBotPlacements, chooseBotDiscards, chooseBotSwap, normalizeDifficulty, BOT_USERNAME
} from '../server/utils/ogGtoonBot.js'
import { slotsForRound, PLACE_MS, DISCARD_MS, SWAP_MS } from '../server/utils/ogGtoonEngine.js'
import {
  publicMatchView, initHands, placeCard, unplaceSlot, checkCommit, checkSwap, recordSwapChoice,
  resolveSwapPhase, expirePhase, autoFillPlacements, runFinalBoardResolution, phaseDurationMs,
  submitDiscard, resolveDiscardPhase, markCommitted, revealPlacedCards, advanceRound, checkMatchEnd, buildRoundLog, TOTAL_ROUNDS
} from '../server/utils/ogGtoonMatchCore.js'
import { registerOgGtoonsPractice, hasLivePracticeMatch } from '../server/utils/ogGtoonsPractice.js'
import { isPracticing } from '../server/utils/ogGtoonPresence.js'
import { revealDurationMs, REVEAL_TIMING_DEFAULTS } from '../utils/ogGtoonReveal.js'

const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE', 'PINK', 'RED', 'BLUE', 'GREEN', 'BLACK', 'SILVER']
function makeDeck({ goal = 'RED', values } = {}) {
  const vals = values || [9, 1, 5, 7, 2, 8, 3, 6, 4, 5, 2, 1]
  return Array.from({ length: 12 }, (_, i) => ({
    ctoonId: `c${i}`, name: `Card ${i}`, assetPath: `/c${i}.png`, characters: [],
    color: i === 11 ? goal : COLORS[i], value: vals[i],
    type1: null, type2: null, type3: null, group: null, isSlam: false, effect: null, position: i
  }))
}
function seeded(seed = 1) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

/* ── Bot ─────────────────────────────────────────────────────────────────────────────────── */

/** A bot hand: [{ idx, value, color }] for the given values. */
function handOf(values, color = 'BLUE') {
  return values.map((value, i) => ({ idx: i, value, color }))
}

test('buildBotDeck: same 12 cards, positions renumbered 0-11, input not mutated', () => {
  const deck = makeDeck()
  const snapshot = JSON.stringify(deck)
  for (const level of ['easy', 'normal', 'hard']) {
    const bot = buildBotDeck(deck, level, seeded(7))
    assert.equal(bot.length, 12)
    assert.deepEqual(bot.map(c => c.position), [...Array(12).keys()])
    assert.deepEqual(bot.map(c => c.ctoonId).sort(), deck.map(c => c.ctoonId).sort())
  }
  assert.equal(JSON.stringify(deck), snapshot)
})

test('buildBotDeck: normal and hard keep the goal card at position 11; easy may not', () => {
  const deck = makeDeck()
  for (const level of ['normal', 'hard']) {
    for (let seed = 1; seed < 20; seed++) {
      assert.equal(buildBotDeck(deck, level, seeded(seed))[11].ctoonId, 'c11')
    }
  }
  const moved = Array.from({ length: 30 }, (_, i) => buildBotDeck(deck, 'easy', seeded(i + 1))[11].ctoonId)
  assert.ok(moved.some(id => id !== 'c11'))
})

test('chooseBotPlacements: fills the round\'s slots, best cards first on normal/hard', () => {
  const hand = handOf([2, 9, 4, 7, 1, 8])
  for (const difficulty of ['normal', 'hard']) {
    const picks = chooseBotPlacements({ difficulty, slots: [1, 2, 3, 4], hand, goalColor: 'RED', rng: seeded(3) })
    assert.deepEqual(picks.map(p => p.slot), [1, 2, 3, 4])
    assert.deepEqual(picks.map(p => hand[p.cardIdx].value).sort((a, b) => b - a), [9, 8, 7, 4])
  }
})

test('chooseBotPlacements: never places more than it holds, never repeats a card', () => {
  const picks = chooseBotPlacements({ difficulty: 'easy', slots: [5, 6], hand: handOf([3]), goalColor: 'RED', rng: seeded(2) })
  assert.equal(picks.length, 1)
  const many = chooseBotPlacements({ difficulty: 'easy', slots: [1, 2, 3, 4], hand: handOf([1, 2, 3, 4, 5, 6]), goalColor: 'RED', rng: seeded(9) })
  assert.equal(new Set(many.map(p => p.cardIdx)).size, 4)
})

test('chooseBotDiscards: easy keeps everything; normal drops clearly weak cards only, within the undealt count', () => {
  const hand = handOf([1, 9])
  const undealt = handOf([8, 8, 8, 8])
  assert.deepEqual(chooseBotDiscards({ difficulty: 'easy', hand, undealt, goalColor: 'RED' }), [])
  assert.deepEqual(chooseBotDiscards({ difficulty: 'normal', hand, undealt, goalColor: 'RED' }), [0])
  assert.deepEqual(chooseBotDiscards({ difficulty: 'normal', hand: handOf([9, 9]), undealt, goalColor: 'RED' }), [])
  assert.deepEqual(chooseBotDiscards({ difficulty: 'normal', hand, undealt: [], goalColor: 'RED' }), [])
  assert.equal(chooseBotDiscards({ difficulty: 'normal', hand: handOf([1, 1, 1]), undealt: handOf([9]), goalColor: 'RED' }).length, 1)
})

test('chooseBotSwap: easy never swaps; nothing to swap with or no slot-7 card never swaps', () => {
  const base = { slotCard: { value: 1, color: 'BLUE' }, undealt: handOf([9, 9]), goalColor: 'RED' }
  assert.equal(chooseBotSwap({ ...base, difficulty: 'easy' }), false)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal', undealt: [] }), false)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal', slotCard: null }), false)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal' }), true)
})

test('chooseBotSwap: keeps a strong slot-7 card', () => {
  const strong = { slotCard: { value: 9, color: 'BLUE' }, undealt: handOf([1, 1]), goalColor: 'RED' }
  assert.equal(chooseBotSwap({ ...strong, difficulty: 'hard' }), false)
})

test('normalizeDifficulty falls back to normal', () => {
  assert.equal(normalizeDifficulty('hard'), 'hard')
  assert.equal(normalizeDifficulty('nope'), 'normal')
  assert.equal(normalizeDifficulty(undefined), 'normal')
})

/* ── Shared match core ───────────────────────────────────────────────────────────────────── */

function freshMatch(deckA, deckB, rng = seeded(5)) {
  return initHands({
    id: 'm1', players: ['a', 'b'], usernames: ['A', 'B'], deckOrder: [deckA, deckB],
    goalColor: [deckA[11].color, deckB[11].color], stake: [0, 0]
  }, rng)
}

/** Places `n` cards (the first n in hand) into the round's slots for side `i`, then commits. */
function autoPlay(m, i, n = Infinity) {
  const slots = slotsForRound(m.currentRound)
  const hand = m.hand[i].slice(0, Math.min(n, slots.length))
  hand.forEach((cardIdx, k) => assert.equal(placeCard(m, i, { cardIdx, slot: slots[k] }).ok, true))
  m.ready[i] = true
}

test('core: opening deal is 6 in hand + 6 undealt, no overlap, covering all 12', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  for (const i of [0, 1]) {
    assert.equal(m.hand[i].length, 6)
    assert.equal(m.undealt[i].length, 6)
    assert.deepEqual([...m.hand[i], ...m.undealt[i]].sort((a, b) => a - b), [...Array(12).keys()])
  }
  assert.equal(m.phase, 'play')
  assert.equal(m.currentRound, 1)
})

test('core: placeCard enforces hand, open slots, and moves/replaces correctly', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  const [c0, c1, c2] = m.hand[0]
  const notInHand = [...Array(12).keys()].find(i => !m.hand[0].includes(i))
  assert.equal(placeCard(m, 0, { cardIdx: notInHand, slot: 1 }).code, 'badCard')
  assert.equal(placeCard(m, 0, { cardIdx: c0, slot: 5 }).code, 'badSlot')   // round 1 only opens 1-4
  assert.equal(placeCard(m, 0, { cardIdx: c0, slot: 1 }).ok, true)
  assert.equal(placeCard(m, 0, { cardIdx: c0, slot: 3 }).ok, true)          // moves
  assert.deepEqual(m.placements[0], [{ slot: 3, cardIdx: c0 }])
  assert.equal(placeCard(m, 0, { cardIdx: c1, slot: 3 }).ok, true)          // replaces c0 in slot 3
  assert.deepEqual(m.placements[0], [{ slot: 3, cardIdx: c1 }])
  assert.equal(placeCard(m, 0, { cardIdx: c2, slot: 1 }).ok, true)
  assert.deepEqual(m.placements[0].map(p => p.slot), [1, 3])
  assert.equal(unplaceSlot(m, 0, { slot: 1 }).ok, true)
  assert.deepEqual(m.placements[0].map(p => p.slot), [3])
  m.ready[0] = true
  assert.equal(placeCard(m, 0, { cardIdx: c0, slot: 2 }).code, 'already_committed')
  assert.equal(unplaceSlot(m, 0, { slot: 3 }).code, 'already_committed')
})

test('core: cap per round — at most one card per slot, so round 1 fits 4 and round 2 fits 3', () => {
  assert.deepEqual([1, 2, 3, 4].map(r => slotsForRound(r)), [[1, 2, 3, 4], [5, 6, 7], [], [8]])
  const m = freshMatch(makeDeck(), makeDeck())
  m.hand[0].slice(0, 6).forEach((cardIdx, k) => placeCard(m, 0, { cardIdx, slot: (k % 4) + 1 }))
  assert.equal(m.placements[0].length, 4)
})

test('core: reveal flips placed cards in slot order, removes them from hand, leaves empty slots empty', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  const [a, b, c] = m.hand[0]
  placeCard(m, 0, { cardIdx: a, slot: 4 })
  placeCard(m, 0, { cardIdx: b, slot: 1 })
  m.ready = [true, true]
  const { entries, order } = revealPlacedCards(m)
  assert.deepEqual(entries[0].map(e => e.slot), [1, 4])
  assert.deepEqual(order, [1, 4])
  assert.deepEqual(m.revealed[1], [])                 // opponent placed nothing: slots stay empty
  assert.equal(m.hand[0].length, 4)
  assert.equal(m.hand[0].includes(a) || m.hand[0].includes(b), false)
  assert.equal(m.hand[0].includes(c), true)
  assert.deepEqual(m.placements, [[], []])
  assert.deepEqual(m.ready, [false, false])
})

test('core: discard phase opens after round 1; hand refills to 6 (4 + n drawn), discards are gone', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  autoPlay(m, 0); autoPlay(m, 1)
  revealPlacedCards(m)
  advanceRound(m)
  assert.equal(m.phase, 'discard')
  assert.equal(m.currentRound, 2)
  assert.equal(placeCard(m, 0, { cardIdx: m.hand[0][0], slot: 5 }).code, 'wrongPhase')

  // Side 0 discards both leftover cards (n = 2 -> deals 4 + 2 = 6); side 1 keeps them (deals 4).
  const gone = [...m.hand[0]]
  const kept = [...m.hand[1]]
  assert.equal(submitDiscard(m, 0, { cardIdxs: gone }).ok, true)
  assert.equal(resolveDiscardPhase(m), false)         // still waiting on side 1
  assert.equal(submitDiscard(m, 1, { cardIdxs: [] }).ok, true)
  assert.equal(resolveDiscardPhase(m), true)
  assert.equal(m.hand[0].length, 6)
  assert.equal(m.hand[1].length, 6)
  assert.equal(m.undealt[0].length, 0)
  assert.equal(m.undealt[1].length, 2)
  assert.equal(gone.some(i => m.hand[0].includes(i)), false)
  assert.deepEqual(m.discarded[0].sort(), gone.sort())
  assert.equal(kept.every(i => m.hand[1].includes(i)), true)
  assert.equal(m.phase, 'play')
})

test('core: discard validation — not in hand, duplicates, and wrong phase are rejected', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  assert.equal(submitDiscard(m, 0, { cardIdxs: [] }).code, 'wrongPhase')
  autoPlay(m, 0); autoPlay(m, 1)
  revealPlacedCards(m); advanceRound(m)
  const inHand = m.hand[0][0]
  assert.equal(submitDiscard(m, 0, { cardIdxs: [99] }).code, 'badCard')
  assert.equal(submitDiscard(m, 0, { cardIdxs: [inHand, inHand] }).code, 'badCard')
  assert.equal(submitDiscard(m, 0, { cardIdxs: [inHand] }).ok, true)
  assert.equal(submitDiscard(m, 0, { cardIdxs: [] }).code, 'already_discarded')
})

/** Plays rounds 1 and 2 (full placements, no discards) and leaves the match in the swap phase. */
function playToSwapPhase(m) {
  for (const r of [1, 2]) {
    autoPlay(m, 0); autoPlay(m, 1)
    revealPlacedCards(m)
    assert.equal(checkMatchEnd(m), null)
    advanceRound(m)
    if (m.phase === 'discard') {
      submitDiscard(m, 0, { cardIdxs: [] }); submitDiscard(m, 1, { cardIdxs: [] }); resolveDiscardPhase(m)
    }
  }
  return m
}

test('core: round 2 opens with 3 slots and round 3 is a swap phase with no placing', () => {
  const m = playToSwapPhase(freshMatch(makeDeck(), makeDeck()))
  assert.equal(m.currentRound, 3)
  assert.equal(m.phase, 'swap')
  assert.deepEqual(m.revealed[0].map(r => r.slot), [1, 2, 3, 4, 5, 6])   // slot 7 is held face down until the swap settles
  assert.equal(m.held[0].slot, 7)
  const view = publicMatchView(m, 'a')
  assert.equal(view.you.heldCard.slot, 7)                                // the owner sees their own held card...
  assert.equal(view.opponent.heldSlot, 7)                                // ...the opponent only sees that one is held
  assert.equal(JSON.stringify(view.opponent).includes(m.held[1].name), false)
  assert.equal(m.undealt[0].length, 2)
  assert.deepEqual(publicMatchView(m, 'a').roundSlots, [])
  assert.equal(placeCard(m, 0, { cardIdx: m.hand[0][0], slot: 7 }).code, 'wrongPhase')
  assert.equal(checkCommit(m, 0, 3).code, 'wrongPhase')
})

test('core: slot-7 swap is held until both choose, then replaces slot 7 with a card still in the deck', () => {
  const m = playToSwapPhase(freshMatch(makeDeck(), makeDeck()))
  const old = m.held[0]
  const poolBefore = [...m.hand[0], ...m.undealt[0]]
  assert.equal(checkSwap(m, 0).ok, true)
  assert.equal(recordSwapChoice(m, 0, true).ok, true)
  assert.equal(checkSwap(m, 0).code, 'already_swapped')
  assert.equal(resolveSwapPhase(m, seeded(3)), null)                 // opponent still deciding
  assert.equal(m.held[0], old)                                       // nothing visible yet
  assert.equal(m.revealed[0].some(r => r.slot === 7), false)
  assert.equal(recordSwapChoice(m, 1, false).ok, true)
  const kept = m.held[1]
  const res = resolveSwapPhase(m, seeded(3))
  assert.deepEqual(res.order, [7])
  assert.equal(res.entries[0].length, 1)
  assert.equal(res.entries[1].length, 1)                             // the unswapped card flips too
  assert.equal(res.entries[1][0], kept)
  assert.deepEqual(m.held, [null, null])
  const now = m.revealed[0].find(r => r.slot === 7)
  assert.notEqual(now.deckIdx, old.deckIdx)
  assert.equal(now.round, 3)
  assert.equal(poolBefore.includes(now.deckIdx), true)
  const poolAfter = [...m.hand[0], ...m.undealt[0]]
  assert.equal(poolAfter.includes(old.deckIdx), true)                // old card went back
  assert.equal(poolAfter.length, poolBefore.length)
  assert.equal(m.revealed[0].length, 7)
  assert.equal(m.swapUsed[0], true)
  assert.equal(m.swapUsed[1], false)
  assert.equal(m.phase, 'play')
})

test('core: a player who discarded everything still has hand cards to swap with', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  autoPlay(m, 0); autoPlay(m, 1); revealPlacedCards(m); advanceRound(m)
  submitDiscard(m, 0, { cardIdxs: [...m.hand[0]] }); submitDiscard(m, 1, { cardIdxs: [] }); resolveDiscardPhase(m)
  assert.equal(m.undealt[0].length, 0)
  autoPlay(m, 0); autoPlay(m, 1); revealPlacedCards(m)
  advanceRound(m)
  assert.equal(m.swapReady[0], false)
  assert.equal(publicMatchView(m, 'a').you.maySwap, true)
  assert.equal(checkSwap(m, 0).ok, true)
})

test('core: a player with no cards left in the deck is not offered the swap and cannot choose it', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  autoPlay(m, 0); autoPlay(m, 1); revealPlacedCards(m); advanceRound(m)
  submitDiscard(m, 0, { cardIdxs: [] }); submitDiscard(m, 1, { cardIdxs: [] }); resolveDiscardPhase(m)
  autoPlay(m, 0); autoPlay(m, 1); revealPlacedCards(m)
  m.undealt[0] = []
  m.hand[0] = []
  advanceRound(m)
  assert.deepEqual(m.swapReady, [true, false])
  assert.equal(publicMatchView(m, 'a').you.maySwap, false)
  assert.equal(publicMatchView(m, 'b').you.maySwap, true)
  assert.equal(recordSwapChoice(m, 1, true).ok, true)
  assert.deepEqual(resolveSwapPhase(m, seeded(1)).order, [7])
})

test('core: swap is rejected outside the swap phase', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  assert.equal(checkSwap(m, 0).code, 'wrongPhase')
  assert.equal(recordSwapChoice(m, 0, true).code, 'wrongPhase')
})

test('core: commit needs every open slot filled — short commits are rejected, in every round', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  assert.equal(checkCommit(m, 0, 1).code, 'needCards')
  const [a, b, c, d] = m.hand[0]
  placeCard(m, 0, { cardIdx: a, slot: 1 }); placeCard(m, 0, { cardIdx: b, slot: 2 }); placeCard(m, 0, { cardIdx: c, slot: 3 })
  assert.equal(checkCommit(m, 0, 1).code, 'needCards')
  placeCard(m, 0, { cardIdx: d, slot: 4 })
  assert.equal(checkCommit(m, 0, 1).ok, true)
})

test('core: commit is blocked in the discard phase, for a stale round, twice, and with no card in sudden death', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  autoPlay(m, 0, 4); m.ready[0] = false
  assert.equal(checkCommit(m, 0, 1).ok, true)
  assert.equal(checkCommit(m, 0, 2).code, 'staleRound')
  m.ready[0] = true
  assert.equal(checkCommit(m, 0, 1).code, 'already_committed')
  m.ready[0] = false
  m.phase = 'discard'
  assert.equal(checkCommit(m, 0, 1).code, 'wrongPhase')
  m.phase = 'play'; m.currentRound = TOTAL_ROUNDS + 1; m.placements[0] = []
  assert.equal(checkCommit(m, 0, TOTAL_ROUNDS + 1).code, 'needCards')
  placeCard(m, 0, { cardIdx: m.hand[0][0], slot: 8 })
  assert.equal(checkCommit(m, 0, TOTAL_ROUNDS + 1).ok, true)
})

test('core: re-running the final board starts from printed colors, so repeats give the same result', () => {
  const recolorEffect = [{ trigger: 'onReveal', target: { selector: 'opponentActiveCard' }, action: { type: 'setColor', color: 'PINK' } }]
  const deckA = makeDeck({ goal: 'BLACK' }).map(c => ({ ...c, effect: recolorEffect }))
  const deckB = makeDeck({ goal: 'BLACK' }).map(c => ({ ...c, ctoonId: `other-${c.ctoonId}` })) // distinct gToons: no duplicate cancellation
  const m = freshMatch(deckA, deckB)
  playToSwapPhase(m)
  const colors = () => m.revealed[1].map(r => r.color).join()
  runFinalBoardResolution(m)
  const first = colors()
  const printed = new Map(m.deckOrder[1].map(c => [c.ctoonId, c.color]))
  assert.equal(m.revealed[1].every(r => r.color === 'PINK' && r.baseColor === printed.get(r.ctoonId)), true)
  runFinalBoardResolution(m)
  assert.equal(colors(), first)
})

test('core: the same gToon on both boards is cancelled in PvP and in practice alike', () => {
  const run = (practice) => {
    const m = freshMatch(makeDeck({ goal: 'BLACK' }), makeDeck({ goal: 'BLACK' }))
    if (practice) m.practice = true
    playToSwapPhase(m)
    runFinalBoardResolution(m)
    return [...m.revealed[0], ...m.revealed[1]].filter(r => r.cancelled).length
  }
  assert.ok(run(false) > 0)
  assert.ok(run(true) > 0)
})

/* ── Game log ────────────────────────────────────────────────────────────────────────────── */

const logText = (m) => JSON.stringify(m.gameLog)
const kinds = (m) => m.gameLog.map(e => e.kind)
const entryOf = (m, kind) => m.gameLog.filter(e => e.kind === kind)
const sectionLines = (entry, label) => entry.sections.find(sec => sec.label === label)?.lines || []

test('game log: records the whole match as it goes, in order, with sequence numbers', () => {
  const m = freshMatch(makeDeck({ goal: 'BLACK' }), makeDeck({ goal: 'BLACK' }))
  assert.deepEqual(kinds(m), ['start', 'phase'])
  const end = playRegulation(m)
  assert.ok(end || true)
  const k = kinds(m)
  for (const expected of ['start', 'phase', 'reveal', 'discard', 'swap', 'scoring']) assert.ok(k.includes(expected), `missing ${expected}`)
  assert.deepEqual(m.gameLog.map(e => e.seq), m.gameLog.map((_, i) => i + 1))
  const scoring = entryOf(m, 'scoring')[0]
  assert.ok(sectionLines(scoring, 'Result').length >= 2)
  assert.equal(entryOf(m, 'reveal').length, 3)                       // rounds 1 and 2, then the held slot 7
  assert.match(entryOf(m, 'reveal')[0].sections[0].lines[0], /^Slot 1: A /)
})

test('game log: never reveals cards that are still hidden', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  placeCard(m, 0, { cardIdx: m.hand[0][0], slot: 1 })
  markCommittedForTest(m)
  // No card names ("Card N") appear before anything is revealed — only the goal colors.
  assert.equal(/Card \d/.test(logText(m)), false)
  assert.equal(entryOf(m, 'commit').length, 2)
})

function markCommittedForTest(m) {
  autoFillPlacements(m, 0); autoFillPlacements(m, 1)
  markCommitted(m, 0); markCommitted(m, 1)
}

test('game log: the view includes it, and high-frequency updates can leave it out', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  assert.equal(publicMatchView(m, 'a').gameLog.length, m.gameLog.length)
  assert.equal('gameLog' in publicMatchView(m, 'a', { log: false }), false)
  assert.equal(publicMatchView(m, 'b').you.sideIndex, 1)
})

test('game log: timeouts and discard/swap results are logged without exposing which cards', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  expirePhase(m, seeded(3))
  assert.equal(entryOf(m, 'timeout').length, 2)
  revealPlacedCards(m); advanceRound(m)
  submitDiscard(m, 0, { cardIdxs: [m.hand[0][0]] }); submitDiscard(m, 1, { cardIdxs: [] })
  resolveDiscardPhase(m)
  const lines = entryOf(m, 'discard')[0].sections[0].lines
  assert.match(lines[0], /^A discarded 1 card and drew 5 cards\.$/)
  assert.match(lines[1], /^B kept their hand/)
})

function effectDeck(prefix, effect, goal = 'BLACK') {
  return makeDeck({ goal }).map(c => ({ ...c, ctoonId: `${prefix}${c.ctoonId}`, effect }))
}

test('game log: final scoring explains cancelled powers, what no longer applies and what changed', () => {
  const buff = [{ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: 5 } }]
  const cancel = [{ trigger: 'onReveal', target: { selector: 'opponentActiveCard' }, action: { type: 'negateEffect' } }]
  const m = freshMatch(effectDeck('a', buff), effectDeck('b', cancel))
  playRegulation(m)
  const scoring = entryOf(m, 'scoring')[0]
  assert.equal(sectionLines(scoring, 'Powers cancelled').length, 7)          // every buffed card faces a canceller
  assert.equal(sectionLines(scoring, 'No longer applying').length, 7)
  assert.equal(sectionLines(scoring, 'What changed').length, 7)
  assert.match(sectionLines(scoring, 'What changed')[0], /\d+ → \d+ \(lost .*\+5\)/)
  assert.equal(sectionLines(scoring, 'Powers in effect').length, 0)
  assert.equal(scoring.data.markers.filter(x => x.kind === 'cancelled').length, 7)
  assert.equal(m.revealed[0].every(r => r.finalValue === r.baseValue), true)   // the +5s really are gone
})

test('game log: the powers that do apply are listed, and a power-free match says so', () => {
  const buff = [{ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: 2 } }]
  const m = freshMatch(effectDeck('a', buff), effectDeck('b', null))
  playRegulation(m)
  const lines = sectionLines(entryOf(m, 'scoring')[0], 'Powers in effect')
  assert.equal(lines.length, 7)
  assert.match(lines[0], /\+2$/)
  const plain = freshMatch(effectDeck('a', null), effectDeck('b', null))
  playRegulation(plain)
  assert.match(sectionLines(entryOf(plain, 'scoring')[0], 'Knocked out')[0], /No powers fired/)
})

test('game log: a preview of the powers so far is logged after each early reveal, without changing the match', () => {
  const buff = [{ trigger: 'onReveal', target: { selector: 'self' }, action: { type: 'modifyValue', operation: 'add', amount: 2 } }]
  const m = freshMatch(effectDeck('a', buff), effectDeck('b', null))
  autoPlay(m, 0); autoPlay(m, 1)
  revealPlacedCards(m)
  const preview = entryOf(m, 'preview')[0]
  assert.ok(preview)
  assert.equal(sectionLines(preview, 'Powers in effect').length, 4)
  assert.equal(m.revealed[0].every(r => r.finalValue === r.baseValue), true)  // preview does not mutate
})

test('game log: it is saved with the round log', () => {
  const m = freshMatch(makeDeck({ goal: 'BLACK' }), makeDeck({ goal: 'BLACK' }))
  playRegulation(m)
  assert.equal(buildRoundLog(m, []).gameLog.length, m.gameLog.length)
})

/* ── Timers: the server plays the default for whoever has not acted ──────────────────────── */

test('core: each phase gets its own deadline (60s placing, 30s discard, 30s swap)', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  assert.equal(phaseDurationMs(m), PLACE_MS)
  assert.equal(PLACE_MS, 60_000); assert.equal(DISCARD_MS, 30_000); assert.equal(SWAP_MS, 30_000)
  assert.ok(Math.abs(m.deadline - (Date.now() + PLACE_MS)) < 1000)
  assert.equal(publicMatchView(m, 'a').phaseEndsAt, m.deadline)
  autoPlay(m, 0); autoPlay(m, 1); revealPlacedCards(m); advanceRound(m)
  assert.equal(m.phase, 'discard')
  assert.ok(Math.abs(m.deadline - (Date.now() + DISCARD_MS)) < 1000)
})

test('core: expiry auto-fills empty slots with random hand cards and keeps what was placed', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  const keep = m.hand[0][0]
  placeCard(m, 0, { cardIdx: keep, slot: 3 })
  const acted = expirePhase(m, seeded(8))
  assert.deepEqual(acted, [0, 1])
  assert.deepEqual(m.ready, [true, true])
  for (const i of [0, 1]) {
    assert.deepEqual(m.placements[i].map(p => p.slot), [1, 2, 3, 4])
    assert.equal(new Set(m.placements[i].map(p => p.cardIdx)).size, 4)
    assert.equal(m.placements[i].every(p => m.hand[i].includes(p.cardIdx)), true)
  }
  assert.equal(m.placements[0].find(p => p.slot === 3).cardIdx, keep)
})

test('core: expiry only acts for players who have not finished the phase', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  autoPlay(m, 0)
  assert.deepEqual(expirePhase(m, seeded(2)), [1])
  autoFillPlacements(m, 0)                              // already full: no-op
  assert.equal(m.placements[0].length, 4)
})

test('core: discard expiry keeps the hand; swap expiry means no swap', () => {
  const m = playToSwapPhase(freshMatch(makeDeck(), makeDeck()))
  const before = m.held[0]
  assert.deepEqual(expirePhase(m, seeded(4)), [0, 1])
  assert.deepEqual(resolveSwapPhase(m, seeded(4)).order, [7])
  assert.equal(m.revealed[0].find(r => r.slot === 7), before)

  const d = freshMatch(makeDeck(), makeDeck())
  autoPlay(d, 0); autoPlay(d, 1); revealPlacedCards(d); advanceRound(d)
  const hands = d.hand.map(h => [...h])
  assert.deepEqual(expirePhase(d, seeded(4)), [0, 1])
  assert.equal(resolveDiscardPhase(d), true)
  assert.deepEqual(d.discarded, [[], []])
  for (const i of [0, 1]) assert.equal(hands[i].every(c => d.hand[i].includes(c)), true)
  assert.equal(d.phase, 'play')
})

/** Plays regulation to the end: two full placing rounds, then both sides skip the slot-7 swap. */
function playRegulation(m) {
  playToSwapPhase(m)
  recordSwapChoice(m, 0, false); recordSwapChoice(m, 1, false)
  resolveSwapPhase(m, seeded(2))
  const end = checkMatchEnd(m)
  if (!end) advanceRound(m)
  return end
}

test('core: a higher-total deck wins the 7-slot board with neutral goals', () => {
  const hi = makeDeck({ goal: 'BLACK', values: [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9] })
  const lo = makeDeck({ goal: 'BLACK', values: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] })
  const m = freshMatch(hi, lo)
  const end = playRegulation(m)
  assert.equal(end.outcome, 'PLAYER1')
  assert.equal(end.winnerIdx, 0)
  assert.equal(m.revealed[0].length, 7)
  assert.deepEqual(m.revealed[0].map(r => r.slot), [1, 2, 3, 4, 5, 6, 7])
  const log = buildRoundLog(m, end.effectsResolved)
  assert.equal(log.rounds.length, 7)
  assert.deepEqual(log.rounds.map(r => r.round), [1, 1, 1, 1, 2, 2, 2])
})

test('core: a tie goes to sudden death (one extra slot, undealt cards come to hand) and ends in a real tie when cards run out', () => {
  const flat = makeDeck({ goal: 'BLACK', values: Array(12).fill(5) })
  const m = freshMatch(flat, makeDeck({ goal: 'BLACK', values: Array(12).fill(5) }))
  const end = playRegulation(m)
  assert.equal(end, null)                            // 35-35 and both have cards: keep playing
  assert.equal(m.currentRound, TOTAL_ROUNDS + 1)
  assert.equal(m.phase, 'play')
  assert.deepEqual(slotsForRound(m.currentRound), [8])
  assert.equal(m.undealt[0].length, 0)               // folded into the hand
  assert.ok(m.hand[0].length >= 1)
  autoPlay(m, 0, 1); autoPlay(m, 1, 1)
  revealPlacedCards(m)
  // 40-40 and both sides still have cards, so another sudden-death slot opens.
  assert.equal(checkMatchEnd(m), null)
  advanceRound(m)
  assert.deepEqual(slotsForRound(m.currentRound), [9])
})

test('core: PvP view carries no practice fields; practice view does', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  assert.equal('practice' in publicMatchView(m, 'a'), false)
  const p = publicMatchView({ ...m, practice: true, difficulty: 'hard' }, 'a')
  assert.equal(p.practice, true)
  assert.equal(p.difficulty, 'hard')
})

test('core: you see your own hand and placements; the opponent sees only face-down slots after commit', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  const mine = m.hand[0][0]
  placeCard(m, 0, { cardIdx: mine, slot: 2 })
  const mineView = publicMatchView(m, 'a')
  assert.equal(mineView.you.hand.length, 6)
  assert.deepEqual(mineView.you.placements, [{ slot: 2, cardIdx: mine }])
  assert.equal(mineView.you.undealtCount, 6)
  // Not committed yet: the opponent learns nothing about the placement.
  assert.deepEqual(publicMatchView(m, 'b').opponent.committedSlots, [])
  m.ready[0] = true
  const oppView = publicMatchView(m, 'b')
  assert.deepEqual(oppView.opponent.committedSlots, [2])
  assert.equal(oppView.opponent.handCount, 6)
  assert.equal('hand' in oppView.opponent, false)
})

test('core: an unplayed card of the opponent is never exposed in the view', () => {
  const m = freshMatch(makeDeck(), makeDeck({ values: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] }))
  placeCard(m, 1, { cardIdx: m.hand[1][0], slot: 1 })
  m.ready[1] = true
  const json = JSON.stringify(publicMatchView(m, 'a'))
  const oppCards = new Set([...m.hand[1], ...m.undealt[1]].filter(i => i !== 11))
  const youOwn = new Set([...m.hand[0], ...m.undealt[0]])
  // Opponent-only identifying text ("Card N") appears only for the public goal card (11).
  const mentioned = [...json.matchAll(/Card (\d+)/g)].map(x => Number(x[1]))
  for (const n of mentioned) assert.equal(n === 11 || youOwn.has(n), true)
  assert.ok(oppCards.size > 0)
})

/* ── Practice runtime (fake sockets, injected deps) ──────────────────────────────────────── */

function harness({ config, deck = makeDeck(), isInPvp = false, userId = 'u1' } = {}) {
  const handlers = {}
  const sent = []
  const io = { local: { to: (sid) => ({ emit: (ev, payload) => sent.push({ sid, ev, payload }) }) } }
  const socket = {
    id: `sock-${userId}`, data: {},
    on: (ev, fn) => { handlers[ev] = fn },
    emit: (ev, payload) => sent.push({ sid: socket.id, ev, payload })
  }
  const user = { id: userId, username: 'Tester' }
  registerOgGtoonsPractice(io, socket, async () => user, {
    loadDeck: async (uid, deckId) => (deckId === 'bad' ? null : deck),
    getConfig: async () => config || { gameEnabled: true, practiceEnabled: true },
    botDelay: () => 0,
    rng: seeded(11),
    isInPvp: () => isInPvp
  })
  const events = (name) => sent.filter(s => s.ev === name).map(s => s.payload)
  const waitFor = async (name, ms = 3000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const found = events(name)
      if (found.length) return found[found.length - 1]
      await new Promise(r => setTimeout(r, 5))
    }
    throw new Error(`timed out waiting for ${name}`)
  }
  return { handlers, sent, events, waitFor, socket }
}

const VIEW_EVENTS = new Set(['oggtoons:matchStart', 'oggtoons:state', 'oggtoons:reveal', 'oggtoons:matchEnd'])
/** The newest full player view the server has sent (matchStart / state / reveal / matchEnd). */
function latestView(h) {
  for (let i = h.sent.length - 1; i >= 0; i--) if (VIEW_EVENTS.has(h.sent[i].ev)) return h.sent[i].payload
  return null
}
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms))
async function until(fn, ms = 3000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = fn()
    if (v) return v
    await tick()
  }
  throw new Error('timed out')
}

/** Starts a match and plays it out: discards nothing, fills every slot, commits, skips (or takes) the swap. */
async function playToEnd(h, { difficulty = 'normal', swap = false } = {}) {
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1', difficulty })
  await h.waitFor('oggtoons:matchStart')
  for (let guard = 0; guard < 60; guard++) {
    if (h.events('oggtoons:matchEnd').length) break
    const view = latestView(h)
    const seen = h.sent.length
    if (view.phase === 'discard' && !view.you.discardReady) {
      await h.handlers['oggtoons:practice:discard']({ cardIdxs: [] })
    } else if (view.phase === 'swap' && !view.you.swapReady) {
      await h.handlers[swap ? 'oggtoons:practice:swap' : 'oggtoons:practice:swapSkip']()
    } else if (view.phase === 'play' && !view.you.ready) {
      const placed = new Set(view.you.placements.map(p => p.cardIdx))
      const free = view.you.hand.filter(c => !placed.has(c.idx))
      const open = view.roundSlots.filter(sl => !view.you.placements.some(p => p.slot === sl))
      for (let k = 0; k < Math.min(free.length, open.length); k++) {
        await h.handlers['oggtoons:practice:place']({ cardIdx: free[k].idx, slot: open[k] })
      }
      await h.handlers['oggtoons:practice:commit']({ round: view.round })
    }
    // Wait for the bot/server to move the match along.
    await until(() => h.sent.length > seen || h.events('oggtoons:matchEnd').length, 2000).catch(() => {})
  }
  return h.waitFor('oggtoons:matchEnd')
}

test('practice: a full match plays to a result, flagged practice, with stake 0 and a bot opponent', async () => {
  const h = harness()
  const end = await playToEnd(h)
  assert.equal(end.over, true)
  assert.ok(['PLAYER1', 'PLAYER2', 'TIE'].includes(end.outcome))
  assert.equal(end.practice, true)
  assert.equal(end.you.stake, 0)
  assert.equal(end.opponent.username, BOT_USERNAME)
  assert.equal(hasLivePracticeMatch('u1'), false)
  assert.equal(isPracticing('u1'), false)
  // 4 + 3 cards on a full 7-slot board for the human (sudden death may add more).
  assert.ok(end.you.revealed.length >= 7)
  assert.deepEqual(end.you.revealed.slice(0, 7).map(r => r.slot), [1, 2, 3, 4, 5, 6, 7])
})

test('practice: a full match also plays out when the human takes the slot-7 swap', async () => {
  const h = harness({ userId: 'u1c' })
  const end = await playToEnd(h, { swap: true })
  assert.equal(end.over, true)
  assert.equal(h.events('oggtoons:swapApplied').length, 1)
  assert.equal(end.you.swapUsed, true)
  assert.equal(end.you.revealed.find(r => r.slot === 7).round, 3)
})

test('practice: committing with unfilled slots is rejected and nothing is revealed', async () => {
  const h = harness({ userId: 'u1b' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  const start = await h.waitFor('oggtoons:matchStart')
  await h.handlers['oggtoons:practice:commit']({ round: 1 })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'needCards')
  for (let k = 0; k < 3; k++) await h.handlers['oggtoons:practice:place']({ cardIdx: start.you.hand[k].idx, slot: k + 1 })
  await h.handlers['oggtoons:practice:commit']({ round: 1 })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'needCards')
  assert.equal(h.events('oggtoons:committed').length, 0)
  assert.equal(h.events('oggtoons:reveal').length, 0)
  await h.handlers['oggtoons:practice:leave']()
})

test('practice: the deal is 6 in hand / 6 undealt, the opponent hand is hidden, and the round advances after a reveal', async () => {
  const h = harness({ userId: 'u2' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1', difficulty: 'normal' })
  const start = await h.waitFor('oggtoons:matchStart')
  assert.equal(start.practice, true)
  assert.equal(start.you.stake, 0)
  assert.equal(start.phase, 'play')
  assert.equal(start.round, 1)
  assert.deepEqual(start.roundSlots, [1, 2, 3, 4])
  assert.equal(start.you.hand.length, 6)
  assert.equal(start.you.undealtCount, 6)
  assert.equal(start.opponent.handCount, 6)
  assert.equal('hand' in start.opponent, false)
  assert.deepEqual(start.opponent.committedSlots, [])
  assert.equal(start.opponent.revealed.length, 0)
  assert.equal(isPracticing('u2'), true)

  assert.ok(start.phaseEndsAt > Date.now())

  // Fill all four slots (out of order), commit; the state then carries round 2 and the discard phase.
  const order = [3, 1, 4, 2]
  for (let k = 0; k < 4; k++) await h.handlers['oggtoons:practice:place']({ cardIdx: start.you.hand[k].idx, slot: order[k] })
  assert.deepEqual(latestView(h).you.placements.map(p => p.slot), [1, 2, 3, 4])
  await h.handlers['oggtoons:practice:commit']({ round: 1 })
  const reveal = await h.waitFor('oggtoons:reveal')
  assert.equal(reveal.reveal.round, 1)
  assert.deepEqual(reveal.reveal.you.map(e => e.slot), [1, 2, 3, 4])
  assert.equal(reveal.round, 2)
  assert.equal(reveal.phase, 'discard')
  assert.equal(reveal.you.hand.length, 2)          // 6 - 4 placed
  assert.deepEqual(reveal.you.placements, [])
  await h.handlers['oggtoons:practice:leave']()
  assert.equal(hasLivePracticeMatch('u2'), false)
  assert.equal(isPracticing('u2'), false)
})

test('practice: place/unplace validate, and a stale commit is ignored', async () => {
  const h = harness({ userId: 'u2b' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  const start = await h.waitFor('oggtoons:matchStart')
  const card = start.you.hand[0].idx
  await h.handlers['oggtoons:practice:place']({ cardIdx: card, slot: 6 })     // round 2's slot
  assert.equal(h.events('oggtoons:error').at(-1).code, 'badSlot')
  await h.handlers['oggtoons:practice:place']({ cardIdx: 999, slot: 1 })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'badCard')
  await h.handlers['oggtoons:practice:place']({ cardIdx: card, slot: 1 })
  assert.equal(latestView(h).you.placements.length, 1)
  await h.handlers['oggtoons:practice:unplace']({ slot: 1 })
  assert.equal(latestView(h).you.placements.length, 0)
  const before = h.sent.length
  await h.handlers['oggtoons:practice:commit']({ round: 7 })                  // stale round
  assert.equal(h.sent.length, before)
  await h.handlers['oggtoons:practice:leave']()
})

/** Plays rounds 1-2 by hand and returns the view once the slot-7 swap phase opens. */
async function playToSwap(h) {
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1', difficulty: 'easy' })
  await h.waitFor('oggtoons:matchStart')
  for (let guard = 0; guard < 40; guard++) {
    const view = latestView(h)
    if (view.phase === 'swap') return view
    const seen = h.sent.length
    if (view.phase === 'discard' && !view.you.discardReady) {
      await h.handlers['oggtoons:practice:discard']({ cardIdxs: [] })
    } else if (view.phase === 'play' && !view.you.ready) {
      const placed = new Set(view.you.placements.map(p => p.cardIdx))
      const free = view.you.hand.filter(c => !placed.has(c.idx))
      const open = view.roundSlots.filter(sl => !view.you.placements.some(p => p.slot === sl))
      for (let k = 0; k < open.length; k++) await h.handlers['oggtoons:practice:place']({ cardIdx: free[k].idx, slot: open[k] })
      await h.handlers['oggtoons:practice:commit']({ round: view.round })
    }
    await until(() => h.sent.length > seen, 2000).catch(() => {})
  }
  throw new Error('never reached the swap phase')
}

test('practice: the slot-7 swap is free, happens once the bot has chosen too, and replaces slot 7', async () => {
  const h = harness({ userId: 'u3' })
  const view = await playToSwap(h)
  assert.equal(view.round, 3)
  assert.deepEqual(view.roundSlots, [])
  assert.equal(view.you.maySwap, true)
  assert.equal(view.you.undealtCount, 2)
  assert.equal(view.you.revealed.some(r => r.slot === 7), false)   // slot 7 is not on the board yet
  const old = view.you.heldCard
  assert.equal(view.opponent.heldSlot, 7)
  await h.handlers['oggtoons:practice:swap']()
  assert.equal(h.events('oggtoons:swapApplied').length, 1)
  const reveal = await until(() => h.events('oggtoons:reveal').find(r => r.reveal.round === 3))
  assert.deepEqual(reveal.reveal.order, [7])
  assert.equal(reveal.reveal.you[0].slot, 7)
  assert.equal(reveal.reveal.opponent[0].slot, 7)
  assert.notEqual(reveal.reveal.you[0].ctoonId, old.ctoonId)
  assert.equal(reveal.you.swapUsed, true)
  await h.handlers['oggtoons:practice:leave']()
})

test('practice: swapping or skipping outside the swap phase is rejected', async () => {
  const h = harness({ userId: 'u3c' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  await h.waitFor('oggtoons:matchStart')
  await h.handlers['oggtoons:practice:swap']()
  assert.equal(h.events('oggtoons:error').at(-1).code, 'wrongPhase')
  await h.handlers['oggtoons:practice:swapSkip']()
  assert.equal(h.events('oggtoons:error').at(-1).code, 'wrongPhase')
  await h.handlers['oggtoons:practice:leave']()
})

test('practice: discard refills the hand to 6 from the undealt cards, then round 2 opens for placing', async () => {
  const h = harness({ userId: 'u3b' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  const start = await h.waitFor('oggtoons:matchStart')
  for (let k = 0; k < 4; k++) await h.handlers['oggtoons:practice:place']({ cardIdx: start.you.hand[k].idx, slot: k + 1 })
  await h.handlers['oggtoons:practice:commit']({ round: 1 })
  const reveal = await h.waitFor('oggtoons:reveal')
  assert.equal(reveal.phase, 'discard')
  assert.equal(reveal.you.hand.length, 2)
  assert.equal(reveal.you.undealtCount, 6)
  await h.handlers['oggtoons:practice:place']({ cardIdx: reveal.you.hand[0].idx, slot: 5 })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'wrongPhase')
  await h.handlers['oggtoons:practice:discard']({ cardIdxs: [reveal.you.hand[0].idx] })  // n = 1 -> draw 4 + 1
  const dealt = await until(() => {
    const v = latestView(h)
    return v.phase === 'play' ? v : null
  })
  assert.equal(dealt.round, 2)
  assert.deepEqual(dealt.roundSlots, [5, 6, 7])
  assert.equal(dealt.you.hand.length, 6)
  assert.equal(dealt.you.undealtCount, 1)
  assert.equal(dealt.you.discardedCount, 1)
  await h.handlers['oggtoons:practice:leave']()
})

test('practice: refused when disabled, when practice is off, when in PvP, and for a bad deck', async () => {
  let h = harness({ config: { gameEnabled: true, practiceEnabled: false }, userId: 'u4' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'practiceDisabled')

  h = harness({ config: { gameEnabled: false, practiceEnabled: true }, userId: 'u5' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'practiceDisabled')

  h = harness({ isInPvp: true, userId: 'u6' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'inMatch')
  assert.equal(hasLivePracticeMatch('u6'), false)

  h = harness({ userId: 'u7' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'bad' })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'badDeck')
  assert.equal(hasLivePracticeMatch('u7'), false)
})

test('practice: a second start inside the cooldown is rejected', async () => {
  const h = harness({ userId: 'u8' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  await h.waitFor('oggtoons:matchStart')
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'tooFast')
  await h.handlers['oggtoons:practice:leave']()
})

test('practice: resume re-sends the live match to a new socket', async () => {
  const h = harness({ userId: 'u9' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  await h.waitFor('oggtoons:matchStart')
  const before = h.events('oggtoons:matchStart').length
  await h.handlers['oggtoons:practice:resume']()
  assert.equal(h.events('oggtoons:matchStart').length, before + 1)
  await h.handlers['oggtoons:practice:leave']()
})

/* ── Timers (mocked clock) ───────────────────────────────────────────────────────────────── */

test('practice: when each phase times out the server plays the default and the match carries on', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const settle = () => new Promise(r => setImmediate(r))
  const h = harness({ userId: 'u10' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1', difficulty: 'easy' })
  assert.equal(latestView(h).phase, 'play')
  assert.equal(latestView(h).phaseEndsAt - Date.now(), PLACE_MS)

  // Round 1: the human does nothing -> 4 random cards are placed and committed for them.
  t.mock.timers.tick(PLACE_MS); await settle()
  let rev = h.events('oggtoons:reveal').at(-1)
  assert.equal(rev.reveal.round, 1)
  assert.deepEqual(rev.reveal.you.map(e => e.slot), [1, 2, 3, 4])
  assert.equal(rev.phase, 'discard')
  // The cards reveal one at a time on the client, so the next phase's clock starts after that animation.
  assert.ok(rev.reveal.steps.length > 0)
  assert.deepEqual(rev.reveal.timing, REVEAL_TIMING_DEFAULTS)   // the pacing in force travels with the reveal
  const round1Reveal = revealDurationMs(rev.reveal.steps, rev.reveal.timing)
  assert.ok(round1Reveal > 0)
  assert.equal(rev.phaseEndsAt - Date.now(), DISCARD_MS + round1Reveal)

  // Discard phase: timing out keeps the hand and opens round 2 with a fresh placing clock.
  t.mock.timers.tick(DISCARD_MS + round1Reveal); await settle()
  let v = latestView(h)
  assert.equal(v.phase, 'play')
  assert.equal(v.round, 2)
  assert.equal(v.you.hand.length, 6)
  assert.equal(v.you.discardedCount, 0)
  assert.equal(v.phaseEndsAt - Date.now(), PLACE_MS)

  // Round 2: 3 cards auto-filled; the swap phase opens with its own clock.
  t.mock.timers.tick(PLACE_MS); await settle()
  rev = h.events('oggtoons:reveal').at(-1)
  assert.equal(rev.reveal.round, 2)
  assert.deepEqual(rev.reveal.you.map(e => e.slot), [5, 6])      // slot 7 stays face down for the swap decision
  assert.equal(rev.phase, 'swap')
  const round2Reveal = revealDurationMs(rev.reveal.steps, rev.reveal.timing)
  assert.equal(rev.phaseEndsAt - Date.now(), SWAP_MS + round2Reveal)

  // Swap phase: timing out means no swap, and the board is scored.
  t.mock.timers.tick(SWAP_MS + round2Reveal); await settle()
  rev = h.events('oggtoons:reveal').at(-1)
  assert.equal(rev.reveal.round, 3)
  assert.deepEqual(rev.reveal.order, [7])
  assert.equal(rev.you.swapUsed, false)
  assert.equal(rev.you.revealed.length >= 7, true)
  await h.handlers['oggtoons:practice:leave']()
})

test('practice: the game log rides along on key updates, not on placing, and is complete at the end', async () => {
  const h = harness({ userId: 'u11' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  const start = await h.waitFor('oggtoons:matchStart')
  assert.deepEqual(start.gameLog.map(e => e.kind), ['start', 'phase'])
  await h.handlers['oggtoons:practice:place']({ cardIdx: start.you.hand[0].idx, slot: 1 })
  assert.equal('gameLog' in h.events('oggtoons:state').at(-1), false)         // placing is log-free
  const end = await playToEnd(harness({ userId: 'u12' }))
  const kindsSeen = end.gameLog.map(e => e.kind)
  for (const k of ['start', 'phase', 'commit', 'reveal', 'discard', 'swap', 'scoring']) assert.ok(kindsSeen.includes(k), `missing ${k}`)
  assert.equal(end.gameLog.at(-1).kind, 'scoring')
  assert.equal(end.you.sideIndex, 0)
  await h.handlers['oggtoons:practice:leave']()
})

/* ── Structural no-points guarantee ──────────────────────────────────────────────────────── */

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, '..', rel), 'utf8')
// Strip comments so the explanatory header (which names these things) doesn't trip the scan.
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('practice + bot code cannot touch points, point logs, or persisted matches', () => {
  const forbidden = [
    /userPoints/i, /pointsLog/i, /ogGtoonMatch\b/i, /ogGtoonMatch\./, /gamePoints/i,
    /awardCappedGamePoints/, /\$transaction/, /prisma/i, /SWAP_COST/, /canSwap/, /persistAndSettle/
  ]
  for (const rel of ['server/utils/ogGtoonsPractice.js', 'server/utils/ogGtoonBot.js', 'server/utils/ogGtoonMatchCore.js']) {
    const src = code(rel)
    for (const re of forbidden) {
      assert.equal(re.test(src), false, `${rel} must not reference ${re}`)
    }
  }
})

test('practice module imports only the allow-listed modules', () => {
  const imports = [...read('server/utils/ogGtoonsPractice.js').matchAll(/from '([^']+)'/g)].map(m => m[1]).sort()
  assert.deepEqual(imports, [
    './ogGtoonBot.js', './ogGtoonEngine.js', './ogGtoonMatchCore.js', './ogGtoonPresence.js',
    './ogGtoonsConfig.js', './ogGtoonDeck.js', 'crypto'
  ].sort())
})

test('core: a slot-7 swap takes 10 off the swapper\'s match score, only for the side that swapped', () => {
  const m = playToSwapPhase(freshMatch(makeDeck({ goal: 'BLACK' }), makeDeck({ goal: 'BLACK' })))
  recordSwapChoice(m, 0, true); recordSwapChoice(m, 1, false)
  resolveSwapPhase(m, seeded(3))
  const raw = (i) => m.revealed[i].reduce((a, r) => a + r.finalValue, 0)
  const end = checkMatchEnd(m)
  const res = end || runFinalBoardResolution(m).outcome
  const [s1, s2] = end ? [end.player1Score, end.player2Score] : [res.player1Score, res.player2Score]
  assert.equal(s1, raw(0) - 10)
  assert.equal(s2, raw(1))
})
