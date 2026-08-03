// server/utils/czoneMailRules.js
//
// Pure decision logic for cZone Mail ("cMail") sending limits. Deliberately free of
// Prisma/Redis/h3 imports so it can be unit-tested under `node --test` (see
// tests/czoneMailRules.test.js), mirroring server/utils/tradeOfferRules.js.
//
// The route layer owns all I/O: it reads counters/timestamps, calls into here for the
// verdict, then performs whatever writes the verdict implies.

export const CZONE_MAIL_DEFAULTS = Object.freeze({
  cooldownSeconds: 30,
  spamWindowMinutes: 6,
  spamThreshold: 10,
  spamBlockHours: 12,
  retentionDays: 90,
  // Per (sender → recipient) pair floor. The global cooldown alone cannot stop one
  // player repeatedly targeting a single other player, which is the harassment shape
  // this feature is most exposed to. 0 disables the pair rule.
  pairCooldownMinutes: 60
})

// Hard bounds so an admin typo cannot disable the protections or brick sending.
const LIMITS = {
  cooldownSeconds:     { min: 0,  max: 3600 },
  spamWindowMinutes:   { min: 1,  max: 1440 },
  spamThreshold:       { min: 2,  max: 1000 },
  spamBlockHours:      { min: 1,  max: 720 },
  retentionDays:       { min: 1,  max: 3650 },
  pairCooldownMinutes: { min: 0,  max: 10080 }
}

function clampInt(value, fallback, { min, max }) {
  // Guard the empty cases explicitly: Number(null) and Number('') are both 0,
  // which is finite, so a missing setting would otherwise clamp to the minimum
  // rather than fall back to its default.
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * Normalize a raw GlobalGameConfig row (or an admin payload) into a complete,
 * in-range settings object. Missing/invalid fields fall back to the defaults.
 */
export function normalizeCzoneMailSettings(raw = {}) {
  const out = {}
  for (const key of Object.keys(CZONE_MAIL_DEFAULTS)) {
    out[key] = clampInt(raw[key], CZONE_MAIL_DEFAULTS[key], LIMITS[key])
  }
  return out
}

/**
 * The spam guard only means anything if a compliant client can actually reach the
 * threshold. With a 30s cooldown a well-behaved sender tops out at 12 messages per
 * 6-minute window, so a threshold of 10 punishes enthusiasm rather than abuse.
 *
 * Returns a human-readable warning string, or null when the settings are coherent.
 * Surfaced in the admin UI rather than enforced, so an admin can still choose a
 * deliberately tight configuration.
 */
export function describeSettingsConflict(settings) {
  const { cooldownSeconds, spamWindowMinutes, spamThreshold } = settings
  if (cooldownSeconds <= 0) return null
  const maxCompliantSends = Math.floor((spamWindowMinutes * 60) / cooldownSeconds) + 1
  if (spamThreshold <= maxCompliantSends) {
    return `With a ${cooldownSeconds}s cooldown, a player obeying it can send up to ` +
      `${maxCompliantSends} messages in ${spamWindowMinutes} minutes — at or above the ` +
      `spam threshold of ${spamThreshold}. Normal play will trigger the ` +
      `${settings.spamBlockHours}-hour block. Raise the threshold above ` +
      `${maxCompliantSends}, or raise the cooldown.`
  }
  return null
}

/**
 * Decide whether a send may proceed.
 *
 * `state` is everything the route already looked up:
 *   now                  {number}  epoch ms
 *   blockedUntil         {number|null} epoch ms of an active spam block (DB-backed)
 *   cooldownExpiresAt    {number|null} epoch ms the global per-sender cooldown ends
 *   pairCooldownExpiresAt{number|null} epoch ms the per-pair cooldown ends
 *   windowCount          {number}  sends already recorded in the current spam window
 *
 * Never reveals recipient-side state (blocks are handled by the caller as a silent
 * no-op, so a sender can't probe who has blocked them).
 */
export function evaluateSendAttempt(state, settings) {
  const {
    now,
    blockedUntil = null,
    cooldownExpiresAt = null,
    pairCooldownExpiresAt = null,
    windowCount = 0
  } = state

  if (blockedUntil && blockedUntil > now) {
    return {
      allowed: false,
      reason: 'spam_block',
      retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000)
    }
  }

  if (cooldownExpiresAt && cooldownExpiresAt > now) {
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfterSeconds: Math.ceil((cooldownExpiresAt - now) / 1000)
    }
  }

  if (settings.pairCooldownMinutes > 0 && pairCooldownExpiresAt && pairCooldownExpiresAt > now) {
    return {
      allowed: false,
      reason: 'pair_cooldown',
      retryAfterSeconds: Math.ceil((pairCooldownExpiresAt - now) / 1000)
    }
  }

  // This send is the one that crosses the threshold — allow it, but trip the block so
  // the *next* attempt is refused. Tripping before delivery would make the limit
  // effectively threshold-1 and is harder to reason about in the logs.
  const nextCount = windowCount + 1
  const trips = nextCount >= settings.spamThreshold

  return {
    allowed: true,
    reason: null,
    retryAfterSeconds: 0,
    tripsSpamBlock: trips,
    windowCount: nextCount,
    blockUntil: trips ? now + settings.spamBlockHours * 3600 * 1000 : null
  }
}

/**
 * Player-facing copy. Deliberately plain language: the audience is roughly 8-14, and
 * the message is read in a modal, not a 2.5s toast.
 */
export function sendRejectionMessage(reason, retryAfterSeconds) {
  const secs = Math.max(0, Number(retryAfterSeconds) || 0)
  switch (reason) {
    case 'cooldown':
      return `Hang on a moment — you can send another cMail in ${secs} second${secs === 1 ? '' : 's'}.`
    case 'pair_cooldown': {
      const mins = Math.ceil(secs / 60)
      if (mins >= 60) {
        const hrs = Math.ceil(mins / 60)
        return `You already sent this player a cMail. You can send them another in about ${hrs} hour${hrs === 1 ? '' : 's'}.`
      }
      return `You already sent this player a cMail. You can send them another in about ${mins} minute${mins === 1 ? '' : 's'}.`
    }
    case 'spam_block': {
      const hrs = Math.ceil(secs / 3600)
      return `You've sent a lot of cMail! You can send more in about ${hrs} hour${hrs === 1 ? '' : 's'}.`
    }
    default:
      return 'That cMail could not be sent right now.'
  }
}

/**
 * Discord content is capped at 2000 characters and the API rejects the whole message
 * with a 400 when it's exceeded. Everything we build is admin-authored plus a
 * username, but truncating here means a long template can never silently kill a
 * player's notifications.
 */
export const DISCORD_CONTENT_LIMIT = 1900

export function truncateForDiscord(content) {
  const s = String(content ?? '')
  if (s.length <= DISCORD_CONTENT_LIMIT) return s
  return `${s.slice(0, DISCORD_CONTENT_LIMIT - 1)}…`
}

/**
 * Neutralize Discord markup in template text before it goes out over the wire.
 *
 * allowed_mentions already blocks pings at the API level, but a template containing
 * `<@1234…>` still *renders* as a real user pill, and markdown/autolinks let an
 * admin's canned sentence look like something it isn't. Since these strings are
 * "pre-made kid-friendly sentences", nothing here should ever be markup.
 */
export function sanitizeForDiscord(text) {
  return String(text ?? '')
    .replace(/[<>]/g, '')          // mention/emoji/channel pills
    .replace(/[`*_~|]/g, '')       // markdown emphasis, spoilers, code
    .replace(/@/g, '')             // belt-and-braces on top of allowed_mentions
    .replace(/\s+/g, ' ')
    .trim()
}

// Bidi controls can visually reorder a sentence; long combining-mark runs ("zalgo")
// overflow inbox rows. Admin-only input, but cheap to reject at the write path.
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/
const COMBINING_RUN = /\p{Mn}{3,}/u

export const TEMPLATE_LIMITS = Object.freeze({
  textMax: 120,
  emojiMax: 8,
  categoryMax: 32
})

/**
 * Validate + normalize one admin-authored template. Returns { ok, value } or
 * { ok: false, error } with a message suitable for a 400 statusMessage.
 */
export function validateTemplateInput(input = {}) {
  const text = String(input.text ?? '').normalize('NFKC').trim()
  if (!text) return { ok: false, error: 'Message text is required.' }
  if (text.length > TEMPLATE_LIMITS.textMax) {
    return { ok: false, error: `Message text must be ${TEMPLATE_LIMITS.textMax} characters or fewer.` }
  }
  if (BIDI_CONTROLS.test(text)) {
    return { ok: false, error: 'Message text contains disallowed text-direction characters.' }
  }
  if (COMBINING_RUN.test(text)) {
    return { ok: false, error: 'Message text contains too many stacked combining marks.' }
  }
  if (/https?:\/\//i.test(text)) {
    return { ok: false, error: 'Message text may not contain links.' }
  }

  const emojiRaw = String(input.emoji ?? '').normalize('NFKC').trim()
  if ([...emojiRaw].length > TEMPLATE_LIMITS.emojiMax) {
    return { ok: false, error: `Emoji must be ${TEMPLATE_LIMITS.emojiMax} characters or fewer.` }
  }
  if (BIDI_CONTROLS.test(emojiRaw) || COMBINING_RUN.test(emojiRaw)) {
    return { ok: false, error: 'Emoji contains disallowed characters.' }
  }

  const categoryRaw = String(input.category ?? '').normalize('NFKC').trim()
  if (categoryRaw.length > TEMPLATE_LIMITS.categoryMax) {
    return { ok: false, error: `Category must be ${TEMPLATE_LIMITS.categoryMax} characters or fewer.` }
  }
  if (BIDI_CONTROLS.test(categoryRaw)) {
    return { ok: false, error: 'Category contains disallowed text-direction characters.' }
  }

  const sortOrder = clampInt(input.sortOrder, 0, { min: -100000, max: 100000 })

  return {
    ok: true,
    value: {
      text,
      emoji: emojiRaw || null,
      category: categoryRaw || null,
      sortOrder,
      active: input.active === undefined ? true : Boolean(input.active)
    }
  }
}
