import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyDeckFilter, isDeckFilterActive, matchesDeckFilter, sharedCharacters } from '../utils/ogGtoonDeckFilter.js'

const raj = { ctoonId: 'a', name: 'Raj', characters: ['Raj'], set: 'gToons Series 3', series: 'Camp Lazlo', gtoonTypes: ['MALE', 'ANIMAL'], gtoonValue: 6, powerDescription: null }
const batman = { ctoonId: 'b', name: 'Batman Running', characters: ['Batman'], set: 'gToons Series 1', series: 'Batman', gtoonTypes: ['HERO'], gtoonValue: 9, powerDescription: '+2 to all Heroes' }

test('an empty filter matches everything and is inactive', () => {
  assert.equal(isDeckFilterActive(emptyDeckFilter()), false)
  assert.equal(matchesDeckFilter(raj, emptyDeckFilter()), true)
})

test('search matches the gToon name or a character name, case-insensitively', () => {
  assert.equal(matchesDeckFilter(batman, { ...emptyDeckFilter(), search: 'running' }), true)
  assert.equal(matchesDeckFilter(batman, { ...emptyDeckFilter(), search: 'BATMAN' }), true)
  assert.equal(matchesDeckFilter({ ...batman, name: 'Dark Knight' }, { ...emptyDeckFilter(), search: 'batman' }), true)
  assert.equal(matchesDeckFilter(raj, { ...emptyDeckFilter(), search: 'batman' }), false)
})

test('set, series, types (any), hasPowers and the number range all narrow the list', () => {
  assert.equal(matchesDeckFilter(raj, { ...emptyDeckFilter(), set: 'gToons Series 1' }), false)
  assert.equal(matchesDeckFilter(raj, { ...emptyDeckFilter(), series: 'Camp Lazlo' }), true)
  assert.equal(matchesDeckFilter(raj, { ...emptyDeckFilter(), types: ['HERO', 'ANIMAL'] }), true)
  assert.equal(matchesDeckFilter(raj, { ...emptyDeckFilter(), types: ['HERO'] }), false)
  assert.equal(matchesDeckFilter(raj, { ...emptyDeckFilter(), hasPowers: true }), false)
  assert.equal(matchesDeckFilter(batman, { ...emptyDeckFilter(), hasPowers: true }), true)
  assert.equal(matchesDeckFilter(batman, { ...emptyDeckFilter(), minNumber: 7 }), true)
  assert.equal(matchesDeckFilter(raj, { ...emptyDeckFilter(), minNumber: 7 }), false)
  assert.equal(matchesDeckFilter(batman, { ...emptyDeckFilter(), maxNumber: '8' }), false)
  assert.equal(matchesDeckFilter(raj, { ...emptyDeckFilter(), minNumber: 6, maxNumber: 6 }), true)
})

test('sharedCharacters reports characters already in the deck on another card', () => {
  const alt = { ctoonId: 'c', name: 'Batman', characters: ['Batman'] }
  assert.deepEqual(sharedCharacters(alt, [batman, raj, undefined]), ['Batman'])
  assert.deepEqual(sharedCharacters(alt, [raj]), [])
  assert.deepEqual(sharedCharacters(batman, [batman]), []) // the same card is not a clash with itself
})
