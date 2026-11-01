// cMoon Prestige: pure-function coverage for the admin-configured level ladder lookup. The
// mutating flow (prestigeUser/getPrestigeStatus) is covered by a live-DB smoke test instead, same
// split this session already uses elsewhere (e.g. cmoonCrossRaid.test.js vs. its own DB smoke
// tests) — those two functions do nothing but Prisma reads/writes, so a unit test would just be a
// mock of Prisma re-asserting its own mock.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { findNextPrestigeLevel } from '../server/utils/cmoonPrestigeLevels.js'

// Text-scan regression test (same technique as tests/cmoonBalanceNoPrizeGrant.test.js, which this
// file is cross-referenced from) protecting the first-visit-only prize-grant gate in
// server/utils/cmoonPrestige.js's prestigeUser: without it, a player could ping-pong between two
// prestige cMoons and re-collect the same fixed prize set on every hop. Scanning source text rather
// than importing — prestigeUser pulls in cmoon.js, which eagerly constructs BullMQ Queue instances
// on import (see tests/cmoonEffectTypes.test.js's comment) — keeps this test DB/Redis-free.
const __dirname = dirname(fileURLToPath(import.meta.url))
const prestigeSrc = readFileSync(join(__dirname, '../server/utils/cmoonPrestige.js'), 'utf8')

test('prestigeUser only grants prizes on a player\'s first-ever visit to a given cMoon', () => {
  assert.match(
    prestigeSrc,
    /priorVisit\s*=\s*await\s+prisma\.cMoonPrestigeLog\.findFirst\(/,
    'prestigeUser must look up whether this player has ever prestiged into the destination cMoon before, to gate repeat prize grants',
  )
  assert.match(
    prestigeSrc,
    /grantCMoonPrizes\(userId,\s*toCMoon\.id\)/,
    'prestigeUser must still call grantCMoonPrizes for a genuine first visit — has the call been removed or renamed?',
  )
  const grantLine = prestigeSrc.split('\n').find(l => l.includes('grantCMoonPrizes(userId, toCMoon.id)'))
  assert.ok(
    grantLine && /priorVisit\s*\?\s*\[\]\s*:/.test(grantLine),
    'the grantCMoonPrizes(userId, toCMoon.id) call must be gated on priorVisit (e.g. `priorVisit ? [] : await grantCMoonPrizes(...)`) — ' +
    'without this gate a player can farm duplicate prizes by repeatedly hopping back and forth between the same two prestige cMoons',
  )
})

test('findNextPrestigeLevel finds the row for currentLevel + 1', () => {
  const levels = [
    { level: 1, pointThreshold: 1000 },
    { level: 2, pointThreshold: 5000 },
    { level: 3, pointThreshold: 20000 },
  ]
  assert.deepEqual(findNextPrestigeLevel(levels, 0), { level: 1, pointThreshold: 1000 })
  assert.deepEqual(findNextPrestigeLevel(levels, 1), { level: 2, pointThreshold: 5000 })
  assert.deepEqual(findNextPrestigeLevel(levels, 2), { level: 3, pointThreshold: 20000 })
})

test('findNextPrestigeLevel returns null once the admin hasn\'t configured that far', () => {
  const levels = [{ level: 1, pointThreshold: 1000 }]
  assert.equal(findNextPrestigeLevel(levels, 1), null)
  assert.equal(findNextPrestigeLevel(levels, 5), null)
})

test('findNextPrestigeLevel treats a null/undefined currentLevel as 0', () => {
  const levels = [{ level: 1, pointThreshold: 1000 }]
  assert.deepEqual(findNextPrestigeLevel(levels, null), { level: 1, pointThreshold: 1000 })
  assert.deepEqual(findNextPrestigeLevel(levels, undefined), { level: 1, pointThreshold: 1000 })
})

test('findNextPrestigeLevel ignores gaps and out-of-order rows — only an exact level+1 match counts', () => {
  // Levels 1 and 3 configured, 2 missing — a player at level 1 must NOT skip ahead to level 3.
  const levels = [{ level: 3, pointThreshold: 99999 }, { level: 1, pointThreshold: 1000 }]
  assert.equal(findNextPrestigeLevel(levels, 1), null)
  assert.deepEqual(findNextPrestigeLevel(levels, 0), { level: 1, pointThreshold: 1000 })
})

test('findNextPrestigeLevel handles an empty ladder', () => {
  assert.equal(findNextPrestigeLevel([], 0), null)
})
