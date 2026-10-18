import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { catalog, decks, harness } from './helpers/ogGtoonTutorialHarness.js'
import { buildTutorialDecks } from '../server/utils/ogGtoonTutorialDeck.js'
import { hasLiveTutorialMatch } from '../server/utils/ogGtoonsTutorial.js'
import { isPracticing } from '../server/utils/ogGtoonPresence.js'
import {
  TUTORIAL_USER_DECK, TUTORIAL_BOT_DECK, TUTORIAL_PLAN, TUTORIAL_CARD_NAMES, scriptedSlotFor
} from '../server/utils/ogGtoonTutorialScript.js'

/* ── The script itself ───────────────────────────────────────────────────────────────────── */

test('script: every named card is an imported original gToon, and each deck is 12 cards', () => {
  assert.equal(TUTORIAL_USER_DECK.length, 12)
  assert.equal(TUTORIAL_BOT_DECK.length, 12)
  assert.equal(new Set(TUTORIAL_USER_DECK).size, 12)
  assert.equal(new Set(TUTORIAL_BOT_DECK).size, 12)
  for (const name of TUTORIAL_CARD_NAMES) assert.ok(catalog.has(name), `${name} is not in the import CSV`)
  assert.ok(decks, 'decks build')
  assert.equal(buildTutorialDecks(new Map([...catalog].filter(([n]) => n !== 'Yogi Bear'))), null, 'a missing card makes the tutorial unavailable')
})

test('script: the plan only uses cards that are in each side\'s hand when they are played', () => {
  const p = TUTORIAL_PLAN
  assert.deepEqual([...p.hand[0]].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5])
  for (const side of [0, 1]) {
    assert.equal(p.hand[side].length, 6)
    assert.equal(new Set([...p.hand[side], ...p.undealt[side]]).size, 12)
  }
  assert.deepEqual(p.rounds[1].user.map(x => x.slot), [1, 2, 3, 4])
  assert.deepEqual(p.rounds[2].user.map(x => x.slot), [5, 6, 7])
  assert.equal(scriptedSlotFor(1, 0), 1)
  assert.equal(scriptedSlotFor(1, 9), null)
})

test('script: the two goal colours are different real colours (Blue vs Green)', () => {
  assert.equal(decks.user[TUTORIAL_PLAN.goalCardIdx[0]].color, 'BLUE')
  assert.equal(decks.bot[TUTORIAL_PLAN.goalCardIdx[1]].color, 'GREEN')
})

async function placeAll(h, round) {
  for (const p of TUTORIAL_PLAN.rounds[round].user) await h.call('place', p)
}

/* ── A full guided match ─────────────────────────────────────────────────────────────────── */

test('tutorial: the scripted match plays through to the scripted win, with no clocks and no points', async () => {
  const h = harness()
  await h.call('start')
  let v = h.view()
  assert.equal(v.tutorial, true)
  assert.equal(v.practice, true)
  assert.equal(v.you.goalColor, 'BLUE')
  assert.equal(v.opponent.goalColor, 'GREEN')
  assert.equal(v.opponent.username, 'Tutorial Bot')
  assert.equal(v.phaseEndsAt, null, 'no timer in round 1')
  assert.deepEqual(v.you.hand.map(c => c.name), TUTORIAL_USER_DECK.slice(0, 6))
  assert.equal(v.you.undealtCount, 6)
  assert.ok(isPracticing(h.userId))

  // Round 1: a commit with empty slots is refused, then the scripted cards go in.
  await h.call('commit', { round: 1 })
  assert.equal(h.errors().at(-1).code, 'needCards')
  await placeAll(h, 1)
  v = h.view()
  assert.deepEqual(v.you.placements.map(p => [p.cardIdx, p.slot]), [[0, 1], [1, 2], [2, 3], [3, 4]])
  await h.call('commit', { round: 1 })

  v = h.view()
  assert.equal(v.phase, 'discard')
  assert.equal(v.phaseEndsAt, null, 'no timer in the discard phase')
  assert.equal(v.round, 2)
  assert.deepEqual(v.you.revealed.map(r => r.name), ['Cindy Bear', 'Yogi Bear', 'Batman', 'Captain Dodgers'])
  assert.deepEqual(v.opponent.revealed.map(r => r.name), ["Bugs Teasin'", 'Cow', 'Aku', 'Captain Dodgers'])

  // Discard: only the scripted card is accepted.
  await h.call('discard', { cardIdxs: [] })
  assert.equal(h.errors().at(-1).code, 'offScript')
  await h.call('discard', { cardIdxs: [5] })
  assert.equal(h.errors().filter(e => e.code === 'offScript').length, 2)
  await h.call('discard', { cardIdxs: [4] })
  v = h.view()
  assert.equal(v.phase, 'play')
  assert.equal(v.round, 2)
  assert.equal(v.phaseEndsAt, null, 'no timer in round 2')
  assert.deepEqual(v.you.hand.map(c => c.name), ['Dexter', 'TOM', 'Pepe Le Pew', 'Goat', 'Buttercup Fighting', 'Blossom Fighting'])
  assert.equal(v.you.discardedCount, 1)

  // Round 2: off-script placements are refused.
  await h.call('place', { cardIdx: 5, slot: 5 })
  assert.equal(h.errors().at(-1).code, 'offScript')
  await placeAll(h, 2)
  await h.call('commit', { round: 2 })

  v = h.view()
  assert.equal(v.phase, 'swap')
  assert.equal(v.phaseEndsAt, null, 'no timer in the swap phase')
  assert.equal(v.you.heldCard.name, 'Goat', 'slot 7 stays face down until the swap is settled')
  assert.equal(v.opponent.heldSlot, 7)
  assert.equal(v.you.maySwap, true)

  // Keeping slot 7 is not part of the script.
  await h.call('swapSkip')
  assert.equal(h.errors().at(-1).code, 'offScript')
  await h.call('swap')
  v = h.view()
  assert.equal(v.phase, 'color', 'TOM and Pepe Le Pew are Silver, so the colour pick comes next')
  assert.equal(v.you.mayChooseColor, true)
  assert.equal(v.you.revealed.find(r => r.slot === 7).name, 'Blossom Fighting')
  assert.equal(v.opponent.revealed.find(r => r.slot === 7).name, 'Bloo')

  await h.call('chooseColor', { color: 'RED' })
  assert.equal(h.errors().at(-1).code, 'offScript')
  await h.call('chooseColor', { color: 'BLUE' })

  const end = h.view()
  assert.equal(h.sent.at(-1).ev, 'oggtoons:matchEnd')
  assert.equal(end.over, true)
  assert.equal(end.outcome, 'PLAYER1')
  assert.equal(end.won, true)
  // Behind on points (27 = 37 - the 10-point swap penalty, vs 43) but ahead 6 to 4 on Blue + Green.
  assert.equal(end.player1Score, 27)
  assert.equal(end.player2Score, 43)

  // What the final board teaches.
  const final = (side, slot) => end[side].revealed.find(r => r.slot === slot)
  assert.equal(final('you', 1).finalValue, 13, 'Cindy Bear +10 next to Yogi Bear')
  assert.equal(final('opponent', 3).finalValue, 5, 'Aku -5 from Batman (not a Hero)')
  assert.equal(final('you', 4).cancelled, true)
  assert.equal(final('opponent', 4).cancelled, true, 'the same gToon on both sides cancels out')
  assert.equal(final('opponent', 1).cancelled, true, "Bugs Teasin' is knocked out by the lower Baby Bugs")
  assert.equal(final('opponent', 5).color, 'BLACK', 'TOM treats the opposing Superman as Black')
  assert.equal(final('opponent', 6).finalValue, 9, "Pepe Le Pew's +2 to Blue also helps the bot's Baby Bugs")
  assert.equal(final('you', 7).finalValue, 12)
  assert.equal(final('you', 5).color, 'BLUE')
  assert.equal(final('you', 6).color, 'BLUE')
  const countGoal = (side) => end[side].revealed.filter(r => !r.cancelled && ['BLUE', 'GREEN'].includes(r.color)).length
  assert.equal(countGoal('you'), 6)
  assert.equal(countGoal('opponent'), 4)

  // Nothing in the whole match mentions a clock.
  const allText = JSON.stringify(end.gameLog)
  assert.doesNotMatch(allText, /\d+s \(/)
  assert.equal(JSON.stringify(h.sent.map(s => s.payload)).includes('"phaseEndsAt":1'), false)
  assert.equal(hasLiveTutorialMatch(h.userId), false, 'the match is cleaned up once it ends')
  assert.equal(isPracticing(h.userId), false)
})

test('tutorial: reveal events carry the one-card-at-a-time steps the board animates', async () => {
  const h = harness()
  await h.call('start')
  await placeAll(h, 1)
  await h.call('commit', { round: 1 })
  const reveal = h.sent.filter(s => s.ev === 'oggtoons:reveal').at(-1).payload
  assert.equal(reveal.reveal.round, 1)
  assert.equal(reveal.reveal.steps.length, 8)
  assert.ok(reveal.reveal.timing)
  await h.call('leave')
})

/* ── Lifecycle ───────────────────────────────────────────────────────────────────────────── */

test('tutorial: refresh resumes the same match; leave ends it', async () => {
  const h = harness()
  await h.call('start')
  await placeAll(h, 1)
  const before = h.view()
  h.sent.length = 0
  await h.call('resume')
  const again = h.sent.at(-1)
  assert.equal(again.ev, 'oggtoons:matchStart')
  assert.equal(again.payload.matchId, before.matchId)
  assert.equal(again.payload.you.placements.length, 4)
  await h.call('leave')
  assert.equal(hasLiveTutorialMatch(h.userId), false)
  assert.equal(isPracticing(h.userId), false)
})

test('tutorial: unavailable while live matches are off, with a missing card, or during a PvP match', async () => {
  const off = harness({ config: { gameEnabled: false } })
  await off.call('start')
  assert.equal(off.errors().at(-1).code, 'tutorialDisabled')
  assert.equal(hasLiveTutorialMatch(off.userId), false)

  const missing = harness({ loadDecks: async () => null })
  await missing.call('start')
  assert.equal(missing.errors().at(-1).code, 'tutorialUnavailable')

  const pvp = harness({ isInPvp: true })
  await pvp.call('start')
  assert.equal(pvp.errors().at(-1).code, 'inMatch')
})

test('tutorial: needs only live matches on, not the practice switch', async () => {
  const h = harness({ config: { gameEnabled: true, practiceEnabled: false } })
  await h.call('start')
  assert.equal(h.view().tutorial, true)
  await h.call('leave')
})

/* ── Structural no-points guarantee ──────────────────────────────────────────────────────── */

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, '..', rel), 'utf8')
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('tutorial code cannot touch points, point logs, or persisted matches', () => {
  const forbidden = [
    /userPoints/i, /pointsLog/i, /ogGtoonMatch\b/i, /ogGtoonMatch\./, /gamePoints/i,
    /awardCappedGamePoints/, /\$transaction/, /prisma/i, /SWAP_COST/, /canSwap/, /persistAndSettle/
  ]
  for (const rel of ['server/utils/ogGtoonsTutorial.js', 'server/utils/ogGtoonTutorialScript.js']) {
    const src = code(rel)
    for (const re of forbidden) assert.equal(re.test(src), false, `${rel} must not reference ${re}`)
  }
})

test('tutorial module imports only the allow-listed modules', () => {
  const imports = [...read('server/utils/ogGtoonsTutorial.js').matchAll(/from '([^']+)'/g)].map(m => m[1]).sort()
  assert.deepEqual(imports, [
    './ogGtoonMatchCore.js', './ogGtoonPresence.js', './ogGtoonTutorialDeck.js', './ogGtoonTutorialScript.js',
    './ogGtoonsConfig.js', 'crypto'
  ].sort())
})
