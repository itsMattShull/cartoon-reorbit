// Pure chat-moderation helpers for MyOrbit — message shape validation and the banned-word
// filter. No Prisma/Redis/socket.io imports, same bare-`node --test`-importable contract as
// server/utils/myOrbitPathfinding.js; this module also runs inside server/socket-server.js (a
// plain `node server/socket-server.js` process), so it never uses the `@/` alias either.

export const MYORBIT_CHAT_MAX_LENGTH = 300

/** Trims and validates a raw chat message. Returns `{ ok: true, message }` or
 * `{ ok: false, reason }` — `reason` is a short machine-readable code, not user-facing prose
 * (the caller decides what to actually say). */
export function parseMyOrbitChatMessage(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'not_a_string' }
  const message = raw.trim()
  if (!message) return { ok: false, reason: 'empty' }
  if (message.length > MYORBIT_CHAT_MAX_LENGTH) return { ok: false, reason: 'too_long' }
  return { ok: true, message }
}

/**
 * Case-insensitive substring match against an admin-managed phrase list (MyOrbitBannedWord is a
 * flat list, not regex — see that model's own schema comment on why) — admins managing this list
 * are not expected to write regex, and a substring check also catches a banned phrase embedded
 * inside a longer word, which a whole-word-only match would miss.
 */
export function containsBannedWord(message, bannedWords) {
  if (!message || !Array.isArray(bannedWords) || !bannedWords.length) return false
  const lower = message.toLowerCase()
  return bannedWords.some(phrase => typeof phrase === 'string' && phrase && lower.includes(phrase.toLowerCase()))
}
