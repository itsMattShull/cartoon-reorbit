// Sanitizes a site user's message before it is relayed into Discord.
//
// See constants.js for the import rules.
//
// ── Why this is strict ───────────────────────────────────────────────────────
// A relayed message arrives in Discord carrying a real site username and that
// user's real avatar. To everyone reading the channel it looks like an ordinary
// message from a community member. That is exactly what makes it a good vehicle
// for a scam link or a faked moderator announcement, so the text is treated as
// hostile even though the sender is authenticated.
//
// ── Order matters ────────────────────────────────────────────────────────────
// NFKC runs FIRST. Normalizing after the @everyone check would let a fullwidth
// "＠everyone" pass the check and then decay into a real one. Escaping runs
// near the end, and truncation runs LAST, because escaping expands the string
// (400 backticks becomes 800 characters) and would otherwise push a legal
// message past Discord's wire limit.

import { OUTBOUND_HARD_CAP } from './constants.js'

// Same class as the inbound normalizer: control chars (keeping \t and \n),
// zero-width, bidi overrides, BOM.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

const MAX_LINES = 8

// Hosts a relayed message may link to. Anything else is refused outright rather
// than stripped, so the sender finds out instead of silently posting a message
// with a hole in it.
const ALLOWED_LINK_HOSTS = new Set([
  'cartoonreorbit.com',
  'www.cartoonreorbit.com',
  'dev.cartoonreorbit.com',
  'cdn.discordapp.com',
  'media.discordapp.net',
  'tenor.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be'
])

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

export class ChatContentError extends Error {
  constructor(reason, message) {
    super(message)
    this.name = 'ChatContentError'
    this.reason = reason
  }
}

/**
 * Site username -> webhook display name.
 *
 * Site usernames are a closed vocabulary (three words from fixed ASCII lists,
 * see server/api/auth/set-username.post.js), so homoglyph impersonation is
 * structurally impossible here — a real strength of this codebase worth not
 * undermining.
 *
 * The suffix still matters, because setting a username also sets the user's
 * Discord guild NICKNAME to the same string. Site usernames and guild nicknames
 * therefore share a namespace, and without a marker a relayed message would be
 * visually identical to a genuine message from that member apart from the small
 * grey APP tag, which people do not read. The middot cannot occur in a site
 * username, so the suffix cannot be forged.
 *
 * Discord rejects webhook usernames containing "clyde" or "discord" with a 400,
 * and 80 characters is the ceiling.
 */
export function webhookDisplayName(username) {
  const base = String(username ?? '').trim()
  if (!/^([A-Z][a-z]+){3}$/.test(base)) {
    throw new ChatContentError('bad_username', 'Your username cannot be used in chat.')
  }
  if (/clyde|discord|everyone|here/i.test(base)) {
    throw new ChatContentError('bad_username', 'Your username cannot be used in chat.')
  }
  const name = `${base} · ReOrbit`
  return name.length > 80 ? name.slice(0, 80) : name
}

/**
 * Site avatar filename -> absolute URL Discord can fetch.
 *
 * Re-validated rather than interpolated. The stored value is not guaranteed to
 * be a bare filename, and this value becomes the user's apparent identity in
 * the guild, so anything unexpected falls back to no avatar (the webhook's
 * default) rather than pointing Discord at an arbitrary path.
 *
 * On localhost the URL is unreachable from Discord and the webhook silently
 * uses its default avatar. That is expected in dev, not an error.
 */
export function avatarUrlFor(avatar, baseUrl) {
  const file = String(avatar ?? '')
  if (!/^[A-Za-z0-9_-]+\.(png|gif|jpe?g|webp)$/i.test(file)) return null
  if (!baseUrl) return null
  return `${baseUrl}/avatars/${encodeURIComponent(file)}`
}

/**
 * Validates and escapes one outbound message.
 *
 * Throws ChatContentError with a machine-readable `reason` so the socket
 * handler can map it to a fixed enum for the client rather than echoing text
 * back.
 */
export function sanitizeOutbound(raw, { maxLength = 400 } = {}) {
  // 0. Bound the input before doing any string work on it. Everything below —
  //    NFKC normalization, several regex passes, Array.from — is superlinear
  //    enough that an authenticated client emitting a multi-megabyte payload
  //    would stall the socket server's event loop, which also runs the games.
  //    The client caps the textarea, so anything past a generous multiple of
  //    the configured limit is not a real message.
  if (typeof raw !== 'string' || raw.length > Math.max(4000, maxLength * 4)) {
    throw new ChatContentError('too_long', `Messages are limited to ${maxLength} characters.`)
  }

  // 1. Normalize first.
  let text = raw.normalize('NFKC')

  // 2. Remove invisibles, including bidi overrides.
  text = text.replace(INVISIBLE, '')

  // 3. Normalize newlines and cap vertical space. One message must not be able
  //    to fill a 224px sidebar column.
  text = text.replace(/\r\n|\r/g, '\n').replace(/\n{3,}/g, '\n\n')
  const lines = text.split('\n')
  if (lines.length > MAX_LINES) text = lines.slice(0, MAX_LINES).join('\n')
  text = text.replace(/[^\S\n]{9,}/g, '        ')

  // 4. Trim and reject empty.
  text = text.trim()
  if (!text) throw new ChatContentError('empty', 'Type a message first.')

  // Length is checked against the ADMIN limit here, before escaping, so the
  // user is judged on what they typed rather than on what escaping did to it.
  if (Array.from(text).length > maxLength) {
    throw new ChatContentError('too_long', `Messages are limited to ${maxLength} characters.`)
  }

  // 5. Mass-ping attempts. allowed_mentions blocks the notification, but
  //    @everyone still renders as attention-grabbing text, so it is refused.
  if (/@everyone|@here/i.test(text)) {
    throw new ChatContentError('mention_blocked', 'Messages cannot contain @everyone or @here.')
  }
  if (/discord\.gg|discord(app)?\.com\/invite/i.test(text)) {
    throw new ChatContentError('invite_blocked', 'Messages cannot contain Discord invite links.')
  }

  // 6. Link host allow-list. A relayed message looks like it came from a
  //    trusted community member, so an arbitrary link is a laundering vector.
  for (const match of text.matchAll(URL_RE)) {
    let url
    try {
      url = new URL(match[0].replace(/[.,;:!?)\]}'"]+$/, ''))
    } catch {
      throw new ChatContentError('bad_link', 'That link could not be read.')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ChatContentError('bad_link', 'Only http and https links are allowed.')
    }
    if (!ALLOWED_LINK_HOSTS.has(url.hostname)) {
      throw new ChatContentError('bad_link', `Links to ${url.hostname} are not allowed in chat.`)
    }
  }

  // 7. Escape Discord markdown. Backslash FIRST, or the escapes get escaped.
  text = text.replace(/([\\`*_~|])/g, '\\$1')

  // 8. Break mention and timestamp syntax with a SPACE. allowed_mentions stops
  //    the ping but a role mention still RENDERS as a highlighted chip, which
  //    is the part people actually react to. A space is used rather than a
  //    zero-width character because step 2 strips those, for good reason.
  text = text.replace(/<(@|#|a?:|t:)/g, '< $1')

  // 9. Neutralize per-line markdown that would fake a heading or a quote.
  text = text
    .split('\n')
    .map((line) => line.replace(/^(\s*)([>#\-+]|\d+\.)/, '$1\\$2'))
    .join('\n')

  // 10. Truncate LAST, by code point. .slice() would split a surrogate pair and
  //     emit mojibake.
  const chars = Array.from(text)
  if (chars.length > OUTBOUND_HARD_CAP) text = chars.slice(0, OUTBOUND_HARD_CAP).join('')

  return text
}
