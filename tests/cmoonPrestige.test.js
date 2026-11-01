// cMoon Prestige: pure-function coverage for the admin-configured level ladder lookup. The
// mutating flow (prestigeUser/getPrestigeStatus) is covered by a live-DB smoke test instead, same
// split this session already uses elsewhere (e.g. cmoonCrossRaid.test.js vs. its own DB smoke
// tests) — those two functions do nothing but Prisma reads/writes, so a unit test would just be a
// mock of Prisma re-asserting its own mock.
import test from 'node:test'
import assert from 'node:assert/strict'
import { findNextPrestigeLevel } from '../server/utils/cmoonPrestigeLevels.js'

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
