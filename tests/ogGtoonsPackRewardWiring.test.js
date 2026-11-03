// Source-level guarantees around the PvP pack reward that a behavioural test can't see (same style as
// tests/edRpsWiring.test.js): what must NOT import it, what the socket process may import, and what is persisted.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const reward = read('server/utils/ogGtoonsPackReward.js')
const socket = read('server/utils/ogGtoonsSocket.js')

test('practice and the tutorial can never reward: they import neither the reward module nor Prisma', () => {
  for (const f of ['server/utils/ogGtoonsPractice.js', 'server/utils/ogGtoonsTutorial.js', 'server/utils/ogGtoonTutorialScript.js']) {
    const src = strip(read(f))
    assert.doesNotMatch(src, /ogGtoonsPackReward/, f)
    assert.doesNotMatch(src, /from ['"][^'"]*prisma(\.js)?['"]/, `${f} must not touch the database`)
    assert.doesNotMatch(src, /persistAndSettle|ogGtoonMatch\.create/, f)
  }
})

test('the reward module is safe to load in the plain-Node socket process (no Nuxt-only imports, no $fetch)', () => {
  const imports = [...strip(reward).matchAll(/^import .* from ['"]([^'"]+)['"]/gm)].map(m => m[1])
  assert.deepEqual(imports.sort(), ['./notifications.js', './packDailyWindow.js'].sort())
  assert.doesNotMatch(strip(reward), /\$fetch|useRuntimeConfig|#imports|from ['"][@~]\//)
})

test('the socket server awards only after a SUCCESSFUL save, after matchEnd is emitted, and never inside the match transaction', () => {
  assert.match(socket, /const saved = await persistFinishedGame\(match, params\)/)
  assert.match(socket, /if \(saved\) awardPvpPack\(io, match\)/)
  const end = socket.slice(socket.indexOf('async function endMatch'), socket.indexOf('/* ── Leaving / disconnect'))
  assert.ok(end.indexOf("EV('matchEnd')") < end.indexOf('awardPvpPack(io, match)'), 'matchEnd goes out first')
  const persist = socket.slice(socket.indexOf('async function persistAndSettle'), socket.indexOf('function tournamentEndParams'))
  assert.doesNotMatch(persist, /evaluatePackReward|awardPvpPack/, 'the award is its own transaction, not part of the match write')
  assert.match(socket, /io\.local\.to\(userRoom\(res\.winnerUserId\)\)\.emit\(EV\('packReward'\)/)
})

test('rounds each player commits themselves are counted, persisted, and survive a restart', () => {
  assert.match(socket, /manualCommits: \[0, 0\]/)
  assert.match(socket, /\(match\.manualCommits \|\|= \[0, 0\]\)\[idx\] \+= 1/)
  assert.match(socket, /player1ManualCommits: match\.manualCommits\?\.\[0\] \?\? 0/)
  assert.match(socket, /player2ManualCommits: match\.manualCommits\?\.\[1\] \?\? 0/)
  assert.match(read('server/utils/ogGtoonsMatchSerialize.js'), /manualCommits: match\.manualCommits \|\| \[0, 0\]/)
})

test('the live match is only counted on the player\'s own commit event, never on the timer auto-fill', () => {
  const core = read('server/utils/ogGtoonMatchCore.js')
  assert.doesNotMatch(core, /manualCommits/, 'the engine (which auto-fills on timeout) must not touch the counter')
  const commitHandler = socket.slice(socket.indexOf("socket.on(EV('commit')"), socket.indexOf("socket.on(EV('discard')"))
  assert.match(commitHandler, /manualCommits/)
})

test('the reconcile cron is registered (registry + handler) as a quiet critical job', () => {
  const jobs = read('server/cron/jobs.js')
  assert.match(jobs, /name: 'reconcileOgGtoonsPackRewards', tier: TIER_CRITICAL, pattern: '6-59\/5 \* \* \* \*', intervalSec: 300, quiet: true/)
  assert.match(read('server/cron/jobHandlers.js'), /reconcileOgGtoonsPackRewards: runReconcileOgGtoonsPackRewards,/)
})

test('config is read fresh inside the award transaction, never from the 60s cached copy', () => {
  assert.doesNotMatch(strip(reward), /getOgGtoonsConfig|ogGtoonsConfig/)
  assert.match(strip(reward), /tx\.gameConfig\.findUnique\(\{\s*where: \{ gameName: 'OgGtoons' \}/)
})
