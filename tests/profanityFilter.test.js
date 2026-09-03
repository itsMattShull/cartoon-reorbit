import { test } from 'node:test'
import assert from 'node:assert/strict'

import { filterProfanity, containsProfanity } from '../server/utils/profanityFilter.js'

test('filterProfanity replaces a bad word with "grilled cheese"', () => {
  assert.equal(filterProfanity('this is shit'), 'this is grilled cheese')
})

test('filterProfanity replaces every bad word independently, not the whole message', () => {
  assert.equal(
    filterProfanity('fuck this shit'),
    'grilled cheese this grilled cheese'
  )
})

test('filterProfanity is case-insensitive but preserves surrounding text', () => {
  assert.equal(filterProfanity('SHIT happens'), 'grilled cheese happens')
  assert.equal(filterProfanity('Fuck.'), 'grilled cheese.')
})

test('filterProfanity catches simple leetspeak and repeated-letter dodges', () => {
  assert.equal(filterProfanity('sh1t'), 'grilled cheese')
  assert.equal(filterProfanity('fuuuuck'), 'grilled cheese')
  assert.equal(filterProfanity('$hit'), 'grilled cheese')
})

test('filterProfanity does not fire on innocent words containing a bad substring', () => {
  // Word-boundary-safe: the token matcher only ever tests whole
  // letter/digit/leet runs, so "ass" inside "class"/"assist" never matches.
  assert.equal(filterProfanity('take this class'), 'take this class')
  assert.equal(filterProfanity('please assist me'), 'please assist me')
  assert.equal(filterProfanity('this is a hell of a day'), 'this is a hell of a day')
})

test('filterProfanity leaves clean text untouched', () => {
  const clean = 'good trade, thanks for the cToon!'
  assert.equal(filterProfanity(clean), clean)
})

test('filterProfanity handles non-string/empty input without throwing', () => {
  assert.equal(filterProfanity(''), '')
  assert.equal(filterProfanity(null), null)
  assert.equal(filterProfanity(undefined), undefined)
})

test('containsProfanity matches filterProfanity\'s detection', () => {
  assert.equal(containsProfanity('this is shit'), true)
  assert.equal(containsProfanity('take this class'), false)
  assert.equal(containsProfanity(''), false)
})
