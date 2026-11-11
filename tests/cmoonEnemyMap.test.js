import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickWeightedMap, resolveMapForRaid, resolveMapForPvp } from '../server/utils/cmoonEnemyMap.js'

test('pickWeightedMap: null for an empty/missing list', () => {
  assert.equal(pickWeightedMap([]), null)
  assert.equal(pickWeightedMap(null), null)
  assert.equal(pickWeightedMap(undefined), null)
})

test('pickWeightedMap: a single candidate is always picked regardless of weight', () => {
  const only = { id: 'a', occurrenceWeight: 1 }
  for (let i = 0; i < 20; i++) assert.equal(pickWeightedMap([only]), only)
})

test('pickWeightedMap: a non-positive/non-finite weight floors to 1 rather than being excluded', () => {
  const zero = { id: 'zero', occurrenceWeight: 0 }
  const negative = { id: 'neg', occurrenceWeight: -5 }
  const nan = { id: 'nan', occurrenceWeight: NaN }
  for (let i = 0; i < 50; i++) {
    const picked = pickWeightedMap([zero, negative, nan])
    assert.ok(['zero', 'neg', 'nan'].includes(picked.id))
  }
})

test('pickWeightedMap: a heavily-weighted candidate is picked far more often over many rolls', () => {
  const heavy = { id: 'heavy', occurrenceWeight: 1000 }
  const light = { id: 'light', occurrenceWeight: 1 }
  let heavyCount = 0
  const trials = 500
  for (let i = 0; i < trials; i++) {
    if (pickWeightedMap([heavy, light]).id === 'heavy') heavyCount++
  }
  assert.ok(heavyCount > trials * 0.9, `expected the heavy candidate to dominate, got ${heavyCount}/${trials}`)
})

test('resolveMapForRaid: a raid boss\'s own overrideMap wins outright, even over a faction default', () => {
  const overrideMap = { id: 'override' }
  const defaultMap = { id: 'default' }
  const enemyMember = { isRaidBoss: true, overrideMap }
  const faction = { defaultMap }
  assert.equal(resolveMapForRaid(enemyMember, faction, []), overrideMap)
})

test('resolveMapForRaid: overrideMap is ignored for a non-raid-boss member, even if set', () => {
  const overrideMap = { id: 'override' }
  const defaultMap = { id: 'default' }
  const enemyMember = { isRaidBoss: false, overrideMap }
  const faction = { defaultMap }
  assert.equal(resolveMapForRaid(enemyMember, faction, []), defaultMap)
})

test('resolveMapForRaid: faction default wins when no boss override is set', () => {
  const defaultMap = { id: 'default' }
  const enemyMember = { isRaidBoss: true, overrideMap: null }
  const faction = { defaultMap }
  assert.equal(resolveMapForRaid(enemyMember, faction, []), defaultMap)
})

test('resolveMapForRaid: falls back to the weighted random pool when neither override nor default is set', () => {
  const pooled = { id: 'pooled', active: true, assignedEnemiesOnly: false, occurrenceWeight: 1 }
  const enemyMember = { isRaidBoss: true, overrideMap: null }
  const faction = { defaultMap: null }
  assert.equal(resolveMapForRaid(enemyMember, faction, [pooled]), pooled)
})

test('resolveMapForRaid: the random pool excludes inactive and assignedEnemiesOnly maps', () => {
  const inactive = { id: 'inactive', active: false, assignedEnemiesOnly: false, occurrenceWeight: 1000 }
  const restricted = { id: 'restricted', active: true, assignedEnemiesOnly: true, occurrenceWeight: 1000 }
  const eligible = { id: 'eligible', active: true, assignedEnemiesOnly: false, occurrenceWeight: 1 }
  const enemyMember = { isRaidBoss: false, overrideMap: null }
  const faction = { defaultMap: null }
  for (let i = 0; i < 20; i++) {
    assert.equal(resolveMapForRaid(enemyMember, faction, [inactive, restricted, eligible]), eligible)
  }
})

test('resolveMapForRaid: null when the pool is empty and neither override nor default applies', () => {
  assert.equal(resolveMapForRaid({ isRaidBoss: false }, {}, []), null)
})

test('resolveMapForPvp: always draws from the active, non-assignedEnemiesOnly pool', () => {
  const inactive = { id: 'inactive', active: false, assignedEnemiesOnly: false, occurrenceWeight: 1000 }
  const restricted = { id: 'restricted', active: true, assignedEnemiesOnly: true, occurrenceWeight: 1000 }
  const eligible = { id: 'eligible', active: true, assignedEnemiesOnly: false, occurrenceWeight: 1 }
  for (let i = 0; i < 20; i++) {
    assert.equal(resolveMapForPvp([inactive, restricted, eligible]), eligible)
  }
})

test('resolveMapForPvp: null when no maps are eligible', () => {
  assert.equal(resolveMapForPvp([]), null)
  assert.equal(resolveMapForPvp([{ id: 'x', active: false }]), null)
})
