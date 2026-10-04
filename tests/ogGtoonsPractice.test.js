import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  buildBotDeck, chooseBotPlacements, chooseBotDiscards, chooseBotSwap, normalizeDifficulty, BOT_USERNAME
} from '../server/utils/ogGtoonBot.js'
import { slotsForRound } from '../server/utils/ogGtoonEngine.js'
import {
  publicMatchView, initHands, placeCard, unplaceSlot, checkCommit, checkSwap, applyHandSwap,
  submitDiscard, resolveDiscardPhase, revealPlacedCards, advanceRound, checkMatchEnd, buildRoundLog, TOTAL_ROUNDS
} from '../server/utils/ogGtoonMatchCore.js'
import { registerOgGtoonsPractice, hasLivePracticeMatch } from '../server/utils/ogGtoonsPractice.js'
import { isPracticing } from '../server/utils/ogGtoonPresence.js'

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

test('chooseBotSwap: easy never swaps; used swap, empty undealt and sudden death never swap', () => {
  const base = { hand: handOf([1, 1, 1, 1, 1, 1]), undealt: handOf([9, 9, 9, 9, 9, 9]), slotCount: 4, round: 1, goalColor: 'RED', swapUsed: false }
  assert.equal(chooseBotSwap({ ...base, difficulty: 'easy' }), null)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal', swapUsed: true }), null)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal', undealt: [] }), null)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal', round: TOTAL_ROUNDS + 1 }), null)
  assert.notEqual(chooseBotSwap({ ...base, difficulty: 'normal' }), null)
})

test('chooseBotSwap: holds a strong hand and only returns a card from the hand', () => {
  const strong = { hand: handOf([9, 9, 9, 9, 9, 9]), undealt: handOf([1, 1, 1, 1, 1, 1]), slotCount: 4, round: 1, goalColor: 'RED', swapUsed: false }
  assert.equal(chooseBotSwap({ ...strong, difficulty: 'hard' }), null)
  const weak = { ...strong, hand: handOf([9, 9, 1, 1, 1, 1]), undealt: handOf([9, 9, 9, 9]) }
  const pick = chooseBotSwap({ ...weak, difficulty: 'hard' })
  assert.ok(weak.hand.some(c => c.idx === pick))
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

test('core: cap per round — at most one card per slot, so round 1 fits 4, round 2 fits 2, round 3 fits 1', () => {
  assert.deepEqual([1, 2, 3, 4].map(r => slotsForRound(r)), [[1, 2, 3, 4], [5, 6], [7], [8]])
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

test('core: swap trades a hand card for a random undealt card once, and not for a placed card', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  const [c0, c1] = m.hand[0]
  const undealtBefore = [...m.undealt[0]]
  placeCard(m, 0, { cardIdx: c1, slot: 1 })
  assert.equal(checkSwap(m, 0, { cardIdx: c1 }).code, 'badCard')       // placed
  assert.equal(checkSwap(m, 0, { cardIdx: undealtBefore[0] }).code, 'badCard') // not in hand
  const res = applyHandSwap(m, 0, { cardIdx: c0 }, seeded(4))
  assert.equal(res.ok, true)
  assert.equal(undealtBefore.includes(res.drawn), true)
  assert.equal(m.hand[0].includes(c0), false)
  assert.equal(m.hand[0].includes(res.drawn), true)
  assert.equal(m.undealt[0].includes(c0), true)
  assert.equal(m.hand[0].length, 6)
  assert.equal(m.undealt[0].length, 6)
  assert.equal(m.swapUsed[0], true)
  assert.equal(checkSwap(m, 0, { cardIdx: m.hand[0][0] }).code, 'swap_used')
})

test('core: commit is blocked in the discard phase, for a stale round, twice, and with no card in sudden death', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  assert.equal(checkCommit(m, 0, 1).ok, true)
  assert.equal(checkCommit(m, 0, 2).code, 'staleRound')
  m.ready[0] = true
  assert.equal(checkCommit(m, 0, 1).code, 'already_committed')
  m.ready[0] = false
  m.phase = 'discard'
  assert.equal(checkCommit(m, 0, 1).code, 'wrongPhase')
  m.phase = 'play'; m.currentRound = TOTAL_ROUNDS + 1
  assert.equal(checkCommit(m, 0, TOTAL_ROUNDS + 1).code, 'needCard')
  placeCard(m, 0, { cardIdx: m.hand[0][0], slot: 8 })
  assert.equal(checkCommit(m, 0, TOTAL_ROUNDS + 1).ok, true)
})

/** Plays regulation to the end, sides placing the full count each round (side 0's best first). */
function playRegulation(m) {
  let end = null
  for (let r = 1; r <= TOTAL_ROUNDS; r++) {
    for (const i of [0, 1]) {
      const slots = slotsForRound(m.currentRound)
      const hand = m.hand[i].slice().sort((x, y) => m.deckOrder[i][y].value - m.deckOrder[i][x].value)
      hand.slice(0, slots.length).forEach((cardIdx, k) => placeCard(m, i, { cardIdx, slot: slots[k] }))
      m.ready[i] = true
    }
    revealPlacedCards(m)
    end = checkMatchEnd(m)
    if (end) break
    advanceRound(m)
    if (m.phase === 'discard') {
      submitDiscard(m, 0, { cardIdxs: [] }); submitDiscard(m, 1, { cardIdxs: [] }); resolveDiscardPhase(m)
    }
  }
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
  assert.deepEqual(log.rounds.map(r => r.round), [1, 1, 1, 1, 2, 2, 3])
})

test('core: a tie goes to sudden death (one extra slot, undealt cards come to hand) and ends in a real tie when cards run out', () => {
  const flat = makeDeck({ goal: 'BLACK', values: Array(12).fill(5) })
  const m = freshMatch(flat, makeDeck({ goal: 'BLACK', values: Array(12).fill(5) }))
  const end = playRegulation(m)
  assert.equal(end, null)                            // 35-35 and both have cards: keep playing
  assert.equal(m.currentRound, TOTAL_ROUNDS + 1)
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

/** Starts a match and plays it out: discards nothing, places a full round, commits. */
async function playToEnd(h, { difficulty = 'normal', place = true } = {}) {
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1', difficulty })
  await h.waitFor('oggtoons:matchStart')
  for (let guard = 0; guard < 60; guard++) {
    if (h.events('oggtoons:matchEnd').length) break
    const view = latestView(h)
    const seen = h.sent.length
    if (view.phase === 'discard' && !view.you.discardReady) {
      await h.handlers['oggtoons:practice:discard']({ cardIdxs: [] })
    } else if (view.phase === 'play' && !view.you.ready) {
      if (place) {
        const placed = new Set(view.you.placements.map(p => p.cardIdx))
        const free = view.you.hand.filter(c => !placed.has(c.idx))
        const open = view.roundSlots.filter(sl => !view.you.placements.some(p => p.slot === sl))
        for (let k = 0; k < Math.min(free.length, open.length); k++) {
          await h.handlers['oggtoons:practice:place']({ cardIdx: free[k].idx, slot: open[k] })
        }
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
  // 4 + 2 + 1 cards on a full 7-slot board for the human (sudden death may add more).
  assert.ok(end.you.revealed.length >= 7)
  assert.deepEqual(end.you.revealed.slice(0, 7).map(r => r.slot), [1, 2, 3, 4, 5, 6, 7])
})

test('practice: committing with nothing placed is allowed, leaves the slots empty, and the match still ends', async () => {
  const h = harness({ userId: 'u1b' })
  const end = await playToEnd(h, { place: false })
  assert.equal(end.over, true)
  assert.equal(end.you.revealed.length, 0)
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

  // Place two cards, commit; after the reveal the state carries round 2 and the discard phase.
  await h.handlers['oggtoons:practice:place']({ cardIdx: start.you.hand[0].idx, slot: 2 })
  await h.handlers['oggtoons:practice:place']({ cardIdx: start.you.hand[1].idx, slot: 4 })
  assert.deepEqual(latestView(h).you.placements.map(p => p.slot), [2, 4])
  await h.handlers['oggtoons:practice:commit']({ round: 1 })
  const reveal = await h.waitFor('oggtoons:reveal')
  assert.equal(reveal.reveal.round, 1)
  assert.deepEqual(reveal.reveal.you.map(e => e.slot), [2, 4])
  assert.equal(reveal.round, 2)
  assert.equal(reveal.phase, 'discard')
  assert.equal(reveal.you.hand.length, 4)          // 6 - 2 placed
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

test('practice: swap is free, once per match, and trades a hand card for an undealt one', async () => {
  const h = harness({ userId: 'u3' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  const start = await h.waitFor('oggtoons:matchStart')
  const out = start.you.hand[0].idx
  await h.handlers['oggtoons:practice:swap']({ cardIdx: 999 })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'badCard')
  await h.handlers['oggtoons:practice:swap']({ cardIdx: out })
  assert.equal(h.events('oggtoons:swapApplied').length, 1)
  const after = latestView(h)
  assert.equal(after.you.swapUsed, true)
  assert.equal(after.you.hand.length, 6)
  assert.equal(after.you.hand.some(c => c.idx === out), false)
  assert.equal(after.you.undealtCount, 6)
  await h.handlers['oggtoons:practice:swap']({ cardIdx: after.you.hand[0].idx })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'swap_used')
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
  assert.deepEqual(dealt.roundSlots, [5, 6])
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
