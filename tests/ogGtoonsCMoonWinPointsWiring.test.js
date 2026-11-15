// Source-level guarantees for the cMoon-points-per-win award (same style as
// tests/ogGtoonsPackRewardWiring.test.js) — importing server/utils/ogGtoonsSocket.js or
// server/utils/cmoon.js directly hangs node --test in this sandbox (both transitively import
// server/utils/queues.js, which keeps a BullMQ/Redis reconnect timer alive with no reachable
// Redis here), so this reads the files as plain text instead of loading them as modules.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const socket = read('server/utils/ogGtoonsSocket.js')
const fn = socket.slice(
  socket.indexOf('async function awardCMoonWinPoints'),
  socket.indexOf('async function endMatch'),
)

test('awardCMoonWinPoints is fire-and-forgotten from endMatch after emitToPlayers, gated on a successful save, same as awardPvpPack', () => {
  const end = socket.slice(socket.indexOf('async function endMatch'), socket.indexOf('/* ── Leaving / disconnect'))
  assert.match(end, /const pointsAwarded = saved \? await awardWinPoints\(match, params\) : 0/)
  assert.match(end, /if \(saved\) awardCMoonWinPoints\(match, params\)\.catch\(/)
  const i1 = end.indexOf('const pointsAwarded = saved ? await awardWinPoints')
  const i2 = end.indexOf('emitToPlayers')
  const i3 = end.indexOf('if (saved) awardCMoonWinPoints')
  assert.ok(i1 !== -1 && i2 !== -1 && i3 !== -1 && i1 < i2 && i2 < i3, 'the cMoon-points award is fired after the player-facing matchEnd emit, not blocking it')
})

test('awardCMoonWinPoints uses the exact same natural-finish, non-tie, non-tournament gate as awardWinPoints', () => {
  const awardWinPoints = socket.slice(socket.indexOf('async function awardWinPoints'), socket.indexOf('async function awardCMoonWinPoints'))
  const gate = /if \(!params\.winnerUserId \|\| params\.outcome === 'TIE' \|\| params\.outcome === 'INCOMPLETE'\) return[^\n]*\n\s*if \(params\.endReason !== 'natural' \|\| match\.tournament\) return/
  assert.match(awardWinPoints, gate)
  assert.match(fn, gate)
})

test('awardCMoonWinPoints reads the admin-configured points amount and the winner\'s own cMoon, awarding nothing for either a 0 amount or a non-cMoon-member winner', () => {
  assert.match(fn, /cMoonOgGtoonsWinPoints:\s*true\s*\}/)
  assert.match(fn, /db\.user\.findUnique\(\{\s*where:\s*\{\s*id:\s*params\.winnerUserId\s*\},\s*select:\s*\{\s*cMoonId:\s*true\s*\}/)
  assert.match(fn, /if \(points <= 0 \|\| !winner\?\.cMoonId\) return/)
})

test('awardCMoonWinPoints writes a CMoonScoreLog row (never increments teamScore/cMoonPoints directly) and recomputes the winner\'s own points immediately', () => {
  assert.match(fn, /db\.cMoonScoreLog\.create\(\{/)
  assert.match(fn, /category:\s*'OG_GTOONS_WIN'/)
  assert.match(fn, /detail:\s*match\.id/)
  assert.match(fn, /weekStart:\s*new Date\(\)/)
  assert.doesNotMatch(fn, /teamScore:\s*\{\s*increment/, 'teamScore must stay a fully-recomputed aggregate, never incremented directly')
  assert.doesNotMatch(fn, /cMoonPoints:\s*\{\s*increment/, 'cMoonPoints must stay a fully-recomputed aggregate, never incremented directly')
  assert.match(fn, /await recomputeCMoonPointsForUsers\(\[params\.winnerUserId\]\)/)
})

test('awardCMoonWinPoints never throws — a points bug must not cost anyone a match result', () => {
  assert.match(fn, /try \{[\s\S]*\} catch \(err\) \{\s*console\.error\('\[ogGtoons\] cMoon win points failed:', err\?\.message \|\| err\)\s*\}/)
})

test('recomputeCMoonPointsForUsers is imported from the cMoon-points aggregate cron, not re-implemented', () => {
  assert.match(socket, /import \{ recomputeCMoonPointsForUsers \} from '\.\.\/cron\/cmoon-points-aggregate\.js'/)
})

test('OG_GTOONS_WIN is registered as a known CMoonScoreLog category with a human-readable label', () => {
  const cmoon = read('server/utils/cmoon.js')
  assert.match(cmoon, /CMOON_SCORE_LOG_CATEGORIES = \[[^\]]*'OG_GTOONS_WIN'[^\]]*\]/)
  assert.match(cmoon, /case 'OG_GTOONS_WIN':\s*\n\s*return 'OG gToons PvP win'/)
})
