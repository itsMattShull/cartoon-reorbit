import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeRiddleAnswer, isCorrectRiddleAnswer } from '../server/utils/cmoonRiddleAnswer.js'

test('normalizeRiddleAnswer trims, lowercases, and collapses internal whitespace', () => {
  assert.equal(normalizeRiddleAnswer('  Blue   Moon  '), 'blue moon')
  assert.equal(normalizeRiddleAnswer('A Keyboard'), 'a keyboard')
  assert.equal(normalizeRiddleAnswer(''), '')
  assert.equal(normalizeRiddleAnswer(null), '')
  assert.equal(normalizeRiddleAnswer(undefined), '')
})

test('normalizeRiddleAnswer never strips punctuation', () => {
  assert.equal(normalizeRiddleAnswer("it's a keyboard!"), "it's a keyboard!")
  assert.notEqual(normalizeRiddleAnswer("it's a keyboard!"), normalizeRiddleAnswer('its a keyboard'))
})

test('isCorrectRiddleAnswer matches case/whitespace-insensitively', () => {
  const riddle = { answer: 'a keyboard' }
  assert.equal(isCorrectRiddleAnswer(riddle, 'A Keyboard'), true)
  assert.equal(isCorrectRiddleAnswer(riddle, '  a   keyboard  '), true)
  assert.equal(isCorrectRiddleAnswer(riddle, 'a mouse'), false)
})

test('isCorrectRiddleAnswer handles a missing riddle/answer without throwing', () => {
  assert.equal(isCorrectRiddleAnswer(null, 'anything'), false)
  assert.equal(isCorrectRiddleAnswer({}, ''), true)
})
