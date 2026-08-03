import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CZONE_MAIL_DEFAULTS,
  normalizeCzoneMailSettings,
  describeSettingsConflict,
  evaluateSendAttempt,
  sendRejectionMessage,
  truncateForDiscord,
  sanitizeForDiscord,
  validateTemplateInput,
  DISCORD_CONTENT_LIMIT,
  TEMPLATE_LIMITS
} from '../server/utils/czoneMailRules.js'

const NOW = 1_700_000_000_000

function settings(overrides = {}) {
  return normalizeCzoneMailSettings({ ...CZONE_MAIL_DEFAULTS, ...overrides })
}

// ── normalizeCzoneMailSettings ───────────────────────────────────────────────

test('normalize falls back to defaults for missing and junk values', () => {
  const s = normalizeCzoneMailSettings({ cooldownSeconds: 'abc', spamThreshold: null })
  assert.equal(s.cooldownSeconds, CZONE_MAIL_DEFAULTS.cooldownSeconds)
  assert.equal(s.spamThreshold, CZONE_MAIL_DEFAULTS.spamThreshold)
  assert.equal(s.retentionDays, CZONE_MAIL_DEFAULTS.retentionDays)
})

test('normalize clamps out-of-range values instead of accepting them', () => {
  const s = normalizeCzoneMailSettings({
    cooldownSeconds: -50,
    spamWindowMinutes: 99999,
    spamThreshold: 1,
    spamBlockHours: 0,
    pairCooldownMinutes: -1
  })
  assert.equal(s.cooldownSeconds, 0)
  assert.equal(s.spamWindowMinutes, 1440)
  assert.equal(s.spamThreshold, 2)
  assert.equal(s.spamBlockHours, 1)
  assert.equal(s.pairCooldownMinutes, 0)
})

test('normalize truncates fractional input rather than rounding up', () => {
  assert.equal(normalizeCzoneMailSettings({ cooldownSeconds: 30.9 }).cooldownSeconds, 30)
})

// ── describeSettingsConflict ─────────────────────────────────────────────────

test('flags the shipped defaults as self-contradictory', () => {
  // 30s cooldown over a 6-minute window allows 13 compliant sends, but the guard
  // trips at 10 — so ordinary play triggers a 12-hour block.
  const warning = describeSettingsConflict(settings())
  assert.ok(warning, 'expected the default configuration to be flagged')
  assert.match(warning, /12-hour block/)
})

test('no warning once the threshold clears what the cooldown permits', () => {
  assert.equal(describeSettingsConflict(settings({ spamThreshold: 20 })), null)
})

test('no warning when the cooldown is disabled entirely', () => {
  assert.equal(describeSettingsConflict(settings({ cooldownSeconds: 0 })), null)
})

test('a longer cooldown resolves the conflict without touching the threshold', () => {
  assert.equal(describeSettingsConflict(settings({ cooldownSeconds: 300 })), null)
})

// ── evaluateSendAttempt ──────────────────────────────────────────────────────

test('allows a send when nothing is pending', () => {
  const v = evaluateSendAttempt({ now: NOW, windowCount: 0 }, settings())
  assert.equal(v.allowed, true)
  assert.equal(v.tripsSpamBlock, false)
  assert.equal(v.windowCount, 1)
  assert.equal(v.blockUntil, null)
})

test('an active spam block outranks every other check', () => {
  const v = evaluateSendAttempt({
    now: NOW,
    blockedUntil: NOW + 3600_000,
    cooldownExpiresAt: NOW + 10_000,
    pairCooldownExpiresAt: NOW + 10_000
  }, settings())
  assert.equal(v.allowed, false)
  assert.equal(v.reason, 'spam_block')
  assert.equal(v.retryAfterSeconds, 3600)
})

test('an expired block does not reject', () => {
  const v = evaluateSendAttempt({ now: NOW, blockedUntil: NOW - 1 }, settings())
  assert.equal(v.allowed, true)
})

test('the global cooldown is checked before the pair cooldown', () => {
  const v = evaluateSendAttempt({
    now: NOW,
    cooldownExpiresAt: NOW + 12_000,
    pairCooldownExpiresAt: NOW + 600_000
  }, settings())
  assert.equal(v.reason, 'cooldown')
  assert.equal(v.retryAfterSeconds, 12)
})

test('the pair cooldown rejects even when the global cooldown has elapsed', () => {
  const v = evaluateSendAttempt({
    now: NOW,
    cooldownExpiresAt: NOW - 1,
    pairCooldownExpiresAt: NOW + 1_800_000
  }, settings())
  assert.equal(v.allowed, false)
  assert.equal(v.reason, 'pair_cooldown')
  assert.equal(v.retryAfterSeconds, 1800)
})

test('the pair cooldown is skipped when configured to 0', () => {
  const v = evaluateSendAttempt({
    now: NOW,
    pairCooldownExpiresAt: NOW + 1_800_000
  }, settings({ pairCooldownMinutes: 0 }))
  assert.equal(v.allowed, true)
})

test('the threshold-crossing send is delivered, and trips the block for the next one', () => {
  const s = settings({ spamThreshold: 10 })
  const ninth = evaluateSendAttempt({ now: NOW, windowCount: 8 }, s)
  assert.equal(ninth.allowed, true)
  assert.equal(ninth.tripsSpamBlock, false)

  const tenth = evaluateSendAttempt({ now: NOW, windowCount: 9 }, s)
  assert.equal(tenth.allowed, true, 'the message that trips the guard is still delivered')
  assert.equal(tenth.tripsSpamBlock, true)
  assert.equal(tenth.blockUntil, NOW + 12 * 3600 * 1000)
})

test('retryAfterSeconds always rounds up so a client never retries too early', () => {
  const v = evaluateSendAttempt({ now: NOW, cooldownExpiresAt: NOW + 1 }, settings())
  assert.equal(v.retryAfterSeconds, 1)
})

// ── sendRejectionMessage ─────────────────────────────────────────────────────

test('rejection copy names the wait and stays plain-language', () => {
  assert.match(sendRejectionMessage('cooldown', 1), /1 second\b/)
  assert.match(sendRejectionMessage('cooldown', 25), /25 seconds/)
  assert.match(sendRejectionMessage('pair_cooldown', 600), /10 minutes/)
  assert.match(sendRejectionMessage('pair_cooldown', 7200), /2 hours/)
  assert.match(sendRejectionMessage('spam_block', 43200), /12 hours/)
})

test('rejection copy never leaks that a recipient blocked the sender', () => {
  for (const reason of ['cooldown', 'pair_cooldown', 'spam_block', 'unknown']) {
    assert.doesNotMatch(sendRejectionMessage(reason, 60), /block(ed|ing)? (you|by)/i)
  }
})

// ── Discord payload helpers ──────────────────────────────────────────────────

test('truncateForDiscord leaves short content untouched', () => {
  assert.equal(truncateForDiscord('Nice cZone!'), 'Nice cZone!')
})

test('truncateForDiscord keeps content under the API limit', () => {
  const out = truncateForDiscord('x'.repeat(5000))
  assert.equal(out.length, DISCORD_CONTENT_LIMIT)
  assert.ok(out.endsWith('…'))
})

test('sanitizeForDiscord defuses mention pills and markdown', () => {
  assert.equal(sanitizeForDiscord('<@1234567890> hi'), '1234567890 hi')
  assert.equal(sanitizeForDiscord('@everyone look'), 'everyone look')
  assert.equal(sanitizeForDiscord('**bold** and `code`'), 'bold and code')
  assert.equal(sanitizeForDiscord('a\n\n  b'), 'a b')
})

// ── validateTemplateInput ────────────────────────────────────────────────────

test('accepts and normalizes a well-formed template', () => {
  const r = validateTemplateInput({ text: '  Nice cZone!  ', emoji: '😄', category: ' Compliments ', sortOrder: '5' })
  assert.equal(r.ok, true)
  assert.equal(r.value.text, 'Nice cZone!')
  assert.equal(r.value.category, 'Compliments')
  assert.equal(r.value.sortOrder, 5)
  assert.equal(r.value.active, true)
})

test('empty and whitespace-only text is rejected', () => {
  assert.equal(validateTemplateInput({ text: '   ' }).ok, false)
  assert.equal(validateTemplateInput({}).ok, false)
})

test('over-length text is rejected', () => {
  const r = validateTemplateInput({ text: 'a'.repeat(TEMPLATE_LIMITS.textMax + 1) })
  assert.equal(r.ok, false)
  assert.match(r.error, /characters or fewer/)
})

test('links are rejected in template text', () => {
  assert.equal(validateTemplateInput({ text: 'Visit https://example.com' }).ok, false)
})

test('bidi override characters are rejected', () => {
  assert.equal(validateTemplateInput({ text: 'Nice‮cZone' }).ok, false)
})

test('zalgo combining-mark runs are rejected', () => {
  assert.equal(validateTemplateInput({ text: `Nice${'́'.repeat(6)}` }).ok, false)
})

test('emoji field is length-limited by code points, not UTF-16 units', () => {
  // Four astral-plane emoji are 8 UTF-16 units but only 4 code points.
  assert.equal(validateTemplateInput({ text: 'ok', emoji: '😄😄😄😄' }).ok, true)
  assert.equal(validateTemplateInput({ text: 'ok', emoji: '😄'.repeat(TEMPLATE_LIMITS.emojiMax + 1) }).ok, false)
})

test('blank optional fields normalize to null rather than empty strings', () => {
  const r = validateTemplateInput({ text: 'ok', emoji: '  ', category: '' })
  assert.equal(r.value.emoji, null)
  assert.equal(r.value.category, null)
})

test('active defaults to true but is respected when given', () => {
  assert.equal(validateTemplateInput({ text: 'ok' }).value.active, true)
  assert.equal(validateTemplateInput({ text: 'ok', active: false }).value.active, false)
})
