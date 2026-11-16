import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMyOrbitMuteBody, parseMyOrbitBanBody, parseMyOrbitUserIdBody,
  parseMyOrbitDeleteMessageBody, parseMyOrbitBannedWordBody,
  MYORBIT_MUTE_MINUTES_MIN, MYORBIT_MUTE_MINUTES_MAX
} from '../server/utils/myOrbitModeration.js'

// ── parseMyOrbitMuteBody ─────────────────────────────────────────────────

test('mute: requires a userId', () => {
  assert.equal(parseMyOrbitMuteBody({ minutes: 10 }).ok, false)
})

test('mute: minutes must be a whole number within bounds', () => {
  assert.equal(parseMyOrbitMuteBody({ userId: 'u1', minutes: MYORBIT_MUTE_MINUTES_MIN - 1 }).ok, false)
  assert.equal(parseMyOrbitMuteBody({ userId: 'u1', minutes: MYORBIT_MUTE_MINUTES_MAX + 1 }).ok, false)
  assert.equal(parseMyOrbitMuteBody({ userId: 'u1', minutes: 1.5 }).ok, false)
  assert.equal(parseMyOrbitMuteBody({ userId: 'u1', minutes: MYORBIT_MUTE_MINUTES_MIN }).ok, true)
  assert.equal(parseMyOrbitMuteBody({ userId: 'u1', minutes: MYORBIT_MUTE_MINUTES_MAX }).ok, true)
})

test('mute: reason is optional, trimmed, and bounded in length', () => {
  const noReason = parseMyOrbitMuteBody({ userId: 'u1', minutes: 5 })
  assert.equal(noReason.data.reason, null)
  const withReason = parseMyOrbitMuteBody({ userId: 'u1', minutes: 5, reason: '  spamming  ' })
  assert.equal(withReason.data.reason, 'spamming')
  const tooLong = parseMyOrbitMuteBody({ userId: 'u1', minutes: 5, reason: 'x'.repeat(301) })
  assert.equal(tooLong.ok, false)
})

// ── parseMyOrbitBanBody ──────────────────────────────────────────────────

test('ban: requires a userId, reason optional', () => {
  assert.equal(parseMyOrbitBanBody({}).ok, false)
  const result = parseMyOrbitBanBody({ userId: 'u1' })
  assert.equal(result.ok, true)
  assert.equal(result.data.reason, null)
})

// ── parseMyOrbitUserIdBody ───────────────────────────────────────────────

test('userId body: requires a non-empty string userId', () => {
  assert.equal(parseMyOrbitUserIdBody({}).ok, false)
  assert.equal(parseMyOrbitUserIdBody({ userId: '' }).ok, false)
  assert.equal(parseMyOrbitUserIdBody({ userId: 'u1' }).ok, true)
})

// ── parseMyOrbitDeleteMessageBody ────────────────────────────────────────

test('delete-message: requires roomId, messageId, and targetUserId', () => {
  assert.equal(parseMyOrbitDeleteMessageBody({ messageId: 'm1', targetUserId: 'u1' }).ok, false)
  assert.equal(parseMyOrbitDeleteMessageBody({ roomId: 'r1', targetUserId: 'u1' }).ok, false)
  assert.equal(parseMyOrbitDeleteMessageBody({ roomId: 'r1', messageId: 'm1' }).ok, false)
  const result = parseMyOrbitDeleteMessageBody({ roomId: 'r1', messageId: 'm1', targetUserId: 'u1', messageText: 'hi' })
  assert.equal(result.ok, true)
  assert.equal(result.data.messageText, 'hi')
})

// ── parseMyOrbitBannedWordBody ───────────────────────────────────────────

test('banned word: requires a non-empty phrase, trimmed, bounded to 80 chars', () => {
  assert.equal(parseMyOrbitBannedWordBody({ phrase: '' }).ok, false)
  assert.equal(parseMyOrbitBannedWordBody({ phrase: '  ' }).ok, false)
  assert.equal(parseMyOrbitBannedWordBody({ phrase: 'x'.repeat(81) }).ok, false)
  const result = parseMyOrbitBannedWordBody({ phrase: '  badword  ' })
  assert.equal(result.ok, true)
  assert.equal(result.data.phrase, 'badword')
})
