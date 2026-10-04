import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  buildBotDeck, chooseBotSwap, normalizeDifficulty, BOT_USERNAME
} from '../server/utils/ogGtoonBot.js'
import {
  publicMatchView, revealNextCards, checkMatchEnd, buildRoundLog, TOTAL_ROUNDS
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

test('buildBotDeck: normal actually reorders (a mirror in the same order would always tie)', () => {
  const deck = makeDeck()
  const orders = new Set(
    Array.from({ length: 20 }, (_, i) => buildBotDeck(deck, 'normal', seeded(i + 1)).map(c => c.ctoonId).join(','))
  )
  assert.ok(orders.size > 1)
  assert.ok([...orders].some(o => o !== deck.map(c => c.ctoonId).join(',')))
})

test('buildBotDeck: hard puts the best 7 of the other 11 in the regulation window', () => {
  const deck = makeDeck({ goal: 'BLACK' }) // neutral goal => no color bonus, pure value order
  const bot = buildBotDeck(deck, 'hard', seeded(3))
  const top7 = deck.slice(0, 11).map(c => c.value).sort((a, b) => b - a).slice(0, 7).sort()
  assert.deepEqual(bot.slice(0, 7).map(c => c.value).sort(), top7)
})

test('chooseBotSwap: easy never swaps; used swap and sudden death never swap', () => {
  const remaining = makeDeck({ values: [1, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9] })
  const base = { remaining, round: 1, goalColor: 'RED', swapUsed: false }
  assert.equal(chooseBotSwap({ ...base, difficulty: 'easy' }), null)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal', swapUsed: true }), null)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal', round: TOTAL_ROUNDS + 1 }), null)
  assert.equal(chooseBotSwap({ ...base, difficulty: 'normal' }) > 0, true)
})

test('chooseBotSwap: holds a strong up-next card, and only returns a valid index', () => {
  const strong = makeDeck({ values: [9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] })
  assert.equal(chooseBotSwap({ difficulty: 'hard', swapUsed: false, round: 1, remaining: strong, goalColor: 'RED' }), null)
  const two = makeDeck().slice(0, 2)
  two[0].value = 1; two[1].value = 9
  assert.equal(chooseBotSwap({ difficulty: 'normal', swapUsed: false, round: 1, remaining: two, goalColor: 'RED' }), 1)
  assert.equal(chooseBotSwap({ difficulty: 'normal', swapUsed: false, round: 1, remaining: two.slice(0, 1), goalColor: 'RED' }), null)
})

test('normalizeDifficulty falls back to normal', () => {
  assert.equal(normalizeDifficulty('hard'), 'hard')
  assert.equal(normalizeDifficulty('nope'), 'normal')
  assert.equal(normalizeDifficulty(undefined), 'normal')
})

/* ── Shared match core ───────────────────────────────────────────────────────────────────── */

function freshMatch(deckA, deckB) {
  return {
    id: 'm1', players: ['a', 'b'], usernames: ['A', 'B'], deckOrder: [deckA, deckB],
    remainingIdx: [[...Array(12).keys()], [...Array(12).keys()]],
    goalColor: [deckA[11].color, deckB[11].color], swapUsed: [false, false], ready: [false, false],
    revealed: [[], []], stake: [0, 0], currentRound: 1
  }
}

test('core: a higher-total deck wins after round 7 with neutral goals', () => {
  const hi = makeDeck({ goal: 'BLACK', values: [9, 9, 9, 9, 9, 9, 9, 1, 1, 1, 1, 1] })
  const lo = makeDeck({ goal: 'BLACK', values: [1, 1, 1, 1, 1, 1, 1, 9, 9, 9, 9, 9] })
  const m = freshMatch(hi, lo)
  let end = null
  for (let r = 1; r <= TOTAL_ROUNDS; r++) {
    m.currentRound = r
    m.ready = [true, true]
    revealNextCards(m)
    end = checkMatchEnd(m)
    if (r < TOTAL_ROUNDS) assert.equal(end, null)
  }
  assert.equal(end.outcome, 'PLAYER1')
  assert.equal(end.winnerIdx, 0)
  assert.equal(buildRoundLog(m, end.effectsResolved).rounds.length, TOTAL_ROUNDS)
})

test('core: PvP view carries no practice fields; practice view does', () => {
  const m = freshMatch(makeDeck(), makeDeck())
  assert.equal('practice' in publicMatchView(m, 'a'), false)
  const p = publicMatchView({ ...m, practice: true, difficulty: 'hard' }, 'a')
  assert.equal(p.practice, true)
  assert.equal(p.difficulty, 'hard')
})

test('core: an unrevealed opponent card is never exposed in the view', () => {
  const m = freshMatch(makeDeck(), makeDeck({ values: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] }))
  const json = JSON.stringify(publicMatchView(m, 'a').opponent)
  assert.equal(json.includes('Card 3'), false) // an unrevealed card is never in the view
  assert.equal(json.includes('Card 11'), true)  // only the goal card is public
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

/** Starts a match and commits every round until the match ends. */
async function playToEnd(h, { difficulty = 'normal' } = {}) {
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1', difficulty })
  const start = await h.waitFor('oggtoons:matchStart')
  let round = start.round
  for (let guard = 0; guard < 30; guard++) {
    if (h.events('oggtoons:matchEnd').length) break
    const before = h.events('oggtoons:reveal').length
    await h.handlers['oggtoons:practice:commit']({ round })
    const t0 = Date.now()
    while (Date.now() - t0 < 3000 && h.events('oggtoons:reveal').length === before) {
      await new Promise(r => setTimeout(r, 5))
    }
    round += 1
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
})

test('practice: matchStart is practice-flagged and opponent card order is not exposed', async () => {
  const h = harness({ userId: 'u2' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1', difficulty: 'normal' })
  const start = await h.waitFor('oggtoons:matchStart')
  assert.equal(start.practice, true)
  assert.equal(start.you.stake, 0)
  assert.equal(start.opponent.revealed.length, 0)
  assert.equal(isPracticing('u2'), true)
  await h.handlers['oggtoons:practice:leave']()
  assert.equal(hasLivePracticeMatch('u2'), false)
  assert.equal(isPracticing('u2'), false)
})

test('practice: swap is free, once per match, and validates the target', async () => {
  const h = harness({ userId: 'u3' })
  await h.handlers['oggtoons:practice:start']({ deckId: 'd1' })
  await h.waitFor('oggtoons:matchStart')
  await h.handlers['oggtoons:practice:swap']({ swapWithIndex: 0 })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'badSwapTarget')
  await h.handlers['oggtoons:practice:swap']({ swapWithIndex: 4 })
  assert.equal(h.events('oggtoons:swapApplied').length, 1)
  await h.handlers['oggtoons:practice:swap']({ swapWithIndex: 3 })
  assert.equal(h.events('oggtoons:error').at(-1).code, 'swap_used')
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
