import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyDeckFilter, isDeckFilterActive, matchesDeckFilter, sharedCharacters, dedupeByCtoon, sortDeckCards } from '../utils/ogGtoonDeckFilter.js'

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

test('dedupeByCtoon keeps one card per gToon and counts the copies', () => {
  const rows = [
    { id: 'uc1', ctoonId: 'a', name: 'Raj' },
    { id: 'uc2', ctoonId: 'b', name: 'Batman Running' },
    { id: 'uc3', ctoonId: 'a', name: 'Raj' },
    { id: 'uc4', ctoonId: 'a', name: 'Raj' }
  ]
  const out = dedupeByCtoon(rows)
  assert.deepEqual(out.map(c => [c.ctoonId, c.ownedCount]), [['a', 3], ['b', 1]])
  assert.equal(out[0].id, 'uc1', 'the first copy stands for the card')
  assert.equal(rows[0].ownedCount, undefined, 'the input rows are not mutated')
  assert.deepEqual(dedupeByCtoon(undefined), [])
})

test('sortDeckCards orders by colour (RED..PINK, BLACK, SILVER), then number low to high, then name', () => {
  const card = (name, gtoonColor, gtoonValue) => ({ name, gtoonColor, gtoonValue })
  const input = [
    card('Silver 3', 'SILVER', 3),
    card('Blue 9', 'BLUE', 9),
    card('Red 7', 'RED', 7),
    card('Blue 2 b', 'BLUE', 2),
    card('Black 1', 'BLACK', 1),
    card('Red 2', 'red', 2),
    card('Blue 2 a', 'BLUE', 2),
    card('Mystery', null, 5)
  ]
  assert.deepEqual(sortDeckCards(input).map(c => c.name), [
    'Red 2', 'Red 7', 'Blue 2 a', 'Blue 2 b', 'Blue 9', 'Black 1', 'Silver 3', 'Mystery'
  ])
  assert.equal(input[0].name, 'Silver 3', 'the input array is not reordered')
})

test('dedupe + sort + search together give a small, ordered, case-insensitive list', () => {
  const rows = [
    { ctoonId: 'a', name: 'Raj', characters: ['Raj'], gtoonColor: 'BLUE', gtoonValue: 6 },
    { ctoonId: 'b', name: 'Dark Knight', characters: ['Batman'], gtoonColor: 'BLACK', gtoonValue: 9 },
    { ctoonId: 'a', name: 'Raj', characters: ['Raj'], gtoonColor: 'BLUE', gtoonValue: 6 },
    { ctoonId: 'c', name: 'Batman Running', characters: ['Batman'], gtoonColor: 'BLUE', gtoonValue: 4 }
  ]
  const shown = sortDeckCards(dedupeByCtoon(rows)).filter(c => matchesDeckFilter(c, { ...emptyDeckFilter(), search: 'BATMAN' }))
  assert.deepEqual(shown.map(c => c.name), ['Batman Running', 'Dark Knight'])
})
