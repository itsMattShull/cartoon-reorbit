import { test } from 'node:test'
import assert from 'node:assert/strict'

import { duplicateCtoonIds, groupByCtoonId } from '../utils/duplicateCtoonIds.js'

test('duplicateCtoonIds keeps only cToons owned two or more times', () => {
  const owned = [
    { id: 'a1', ctoonId: 'bugs'   },
    { id: 'a2', ctoonId: 'bugs'   },
    { id: 'a3', ctoonId: 'daffy'  },
    { id: 'a4', ctoonId: 'taz'    },
    { id: 'a5', ctoonId: 'taz'    },
    { id: 'a6', ctoonId: 'taz'    },
  ]
  assert.deepEqual(duplicateCtoonIds(owned), new Set(['bugs', 'taz']))
})

test('duplicateCtoonIds does not exclude the lowest mint the way the legacy server param does', () => {
  // The newsite filter shows EVERY copy of a duplicated cToon. Owning three
  // copies means three cards, not two.
  const owned = [
    { id: 'a1', ctoonId: 'bugs', mintNumber: 4  },
    { id: 'a2', ctoonId: 'bugs', mintNumber: 12 },
    { id: 'a3', ctoonId: 'bugs', mintNumber: 30 },
  ]
  const dupes = duplicateCtoonIds(owned)
  assert.equal(owned.filter(c => dupes.has(c.ctoonId)).length, 3)
})

test('duplicateCtoonIds handles empty and single-copy collections', () => {
  assert.deepEqual(duplicateCtoonIds([]), new Set())
  assert.deepEqual(duplicateCtoonIds([{ ctoonId: 'bugs' }]), new Set())
})

test('duplicateCtoonIds ignores rows with a missing ctoonId', () => {
  const owned = [
    { id: 'a1' },
    { id: 'a2', ctoonId: null },
    { id: 'a3', ctoonId: undefined },
    { id: 'a4', ctoonId: 'bugs' },
  ]
  assert.deepEqual(duplicateCtoonIds(owned), new Set())
})

test('duplicateCtoonIds counts null mint numbers as real copies', () => {
  // mintNumber is nullable in the schema and multiple NULLs per ctoonId are
  // allowed, so a duplicate group made entirely of null mints is realistic.
  const owned = [
    { id: 'a1', ctoonId: 'bugs', mintNumber: null },
    { id: 'a2', ctoonId: 'bugs', mintNumber: null },
  ]
  assert.deepEqual(duplicateCtoonIds(owned), new Set(['bugs']))
})

test('groupByCtoonId clusters copies without reordering the groups themselves', () => {
  // Input is already sorted by mint number ascending; grouping must preserve
  // that both between groups (first-seen wins) and within each group.
  const sorted = [
    { id: 'a1', ctoonId: 'bugs',  mintNumber: 5  },
    { id: 'a2', ctoonId: 'taz',   mintNumber: 12 },
    { id: 'a3', ctoonId: 'taz',   mintNumber: 18 },
    { id: 'a4', ctoonId: 'bugs',  mintNumber: 40 },
  ]
  assert.deepEqual(
    groupByCtoonId(sorted).map(c => c.id),
    ['a1', 'a4', 'a2', 'a3']
  )
})

test('groupByCtoonId is a no-op for a list with no duplicates', () => {
  const list = [{ id: 'a1', ctoonId: 'bugs' }, { id: 'a2', ctoonId: 'taz' }]
  assert.deepEqual(groupByCtoonId(list).map(c => c.id), ['a1', 'a2'])
  assert.deepEqual(groupByCtoonId([]), [])
})
