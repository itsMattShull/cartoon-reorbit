import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMyOrbitChatMessage, containsBannedWord, MYORBIT_CHAT_MAX_LENGTH } from '../server/utils/myOrbitChatFilter.js'

test('parseMyOrbitChatMessage: trims whitespace', () => {
  const result = parseMyOrbitChatMessage('  hello there  ')
  assert.equal(result.ok, true)
  assert.equal(result.message, 'hello there')
})

test('parseMyOrbitChatMessage: rejects an empty or whitespace-only message', () => {
  assert.equal(parseMyOrbitChatMessage('').ok, false)
  assert.equal(parseMyOrbitChatMessage('   ').ok, false)
})

test('parseMyOrbitChatMessage: rejects a non-string', () => {
  assert.equal(parseMyOrbitChatMessage(undefined).ok, false)
  assert.equal(parseMyOrbitChatMessage(42).ok, false)
  assert.equal(parseMyOrbitChatMessage(null).ok, false)
})

test(`parseMyOrbitChatMessage: rejects a message over ${MYORBIT_CHAT_MAX_LENGTH} characters`, () => {
  const result = parseMyOrbitChatMessage('x'.repeat(MYORBIT_CHAT_MAX_LENGTH + 1))
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'too_long')
})

test('parseMyOrbitChatMessage: accepts exactly the max length', () => {
  assert.equal(parseMyOrbitChatMessage('x'.repeat(MYORBIT_CHAT_MAX_LENGTH)).ok, true)
})

test('containsBannedWord: case-insensitive substring match', () => {
  assert.equal(containsBannedWord('this has a BADWORD in it', ['badword']), true)
  assert.equal(containsBannedWord('nothing bad here', ['badword']), false)
})

test('containsBannedWord: matches a banned phrase embedded inside a longer word', () => {
  assert.equal(containsBannedWord('thisisabadwordhere', ['badword']), true)
})

test('containsBannedWord: false for an empty message or empty list', () => {
  assert.equal(containsBannedWord('', ['badword']), false)
  assert.equal(containsBannedWord('hello', []), false)
  assert.equal(containsBannedWord('hello', null), false)
})

test('containsBannedWord: tolerates junk entries in the list without throwing', () => {
  assert.equal(containsBannedWord('hello world', [null, '', undefined, 42, 'world']), true)
})
