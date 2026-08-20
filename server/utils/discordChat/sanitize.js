// Sanitizes a site user's message before it is relayed into Discord. Treated
// as hostile even though the sender is authenticated: a relayed message
// carries a real username and avatar, so it reads as a trusted community
// member — a good vehicle for a scam link or a fake announcement.
//
// Order matters: NFKC runs before the @everyone check (a fullwidth ＠ would
// otherwise slip past and decay into a real mention), and truncation runs
// last (escaping expands the string).

import { OUTBOUND_HARD_CAP } from './constants.js'

const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g
const MAX_LINES = 8

const ALLOWED_LINK_HOSTS = new Set([
  'cartoonreorbit.com', 'www.cartoonreorbit.com', 'dev.cartoonreorbit.com',
  'cdn.discordapp.com', 'media.discordapp.net',
  'tenor.com', 'youtube.com', 'www.youtube.com', 'youtu.be'
])

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

export class ChatContentError extends Error {
  constructor(reason, message) {
    super(message)
    this.name = 'ChatContentError'
    this.reason = reason
  }
}

// Site usernames are a closed ASCII vocabulary, so homoglyph impersonation
// isn't possible — but setting one also sets the Discord guild nickname, so
// the "· ReOrbit" suffix (unforgeable: a middot can't appear in a username)
// is what distinguishes a relayed message from a real one by that member.
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

// Re-validated rather than trusted: set-avatar.post.js has no traversal
// guard, so the stored value isn't safe to interpolate as-is.
export function avatarUrlFor(avatar, baseUrl) {
  const file = String(avatar ?? '')
  if (!/^[A-Za-z0-9_-]+\.(png|gif|jpe?g|webp)$/i.test(file)) return null
  if (!baseUrl) return null
  return `${baseUrl}/avatars/${encodeURIComponent(file)}`
}

export function sanitizeOutbound(raw, { maxLength = 400 } = {}) {
  // Bound the input before doing string work on it — NFKC + several regex
  // passes over a multi-MB payload would stall the socket server's event loop.
  if (typeof raw !== 'string' || raw.length > Math.max(4000, maxLength * 4)) {
    throw new ChatContentError('too_long', `Messages are limited to ${maxLength} characters.`)
  }

  let text = raw.normalize('NFKC').replace(INVISIBLE, '')

  text = text.replace(/\r\n|\r/g, '\n').replace(/\n{3,}/g, '\n\n')
  const lines = text.split('\n')
  if (lines.length > MAX_LINES) text = lines.slice(0, MAX_LINES).join('\n')
  text = text.replace(/[^\S\n]{9,}/g, '        ')

  text = text.trim()
  if (!text) throw new ChatContentError('empty', 'Type a message first.')
  if (Array.from(text).length > maxLength) {
    throw new ChatContentError('too_long', `Messages are limited to ${maxLength} characters.`)
  }

  if (/@everyone|@here/i.test(text)) {
    throw new ChatContentError('mention_blocked', 'Messages cannot contain @everyone or @here.')
  }
  if (/discord\.gg|discord(app)?\.com\/invite/i.test(text)) {
    throw new ChatContentError('invite_blocked', 'Messages cannot contain Discord invite links.')
  }

  // A relayed message looks trusted, so an arbitrary link is a laundering
  // vector — allow-list rather than strip, so the sender knows why it failed.
  for (const match of text.matchAll(URL_RE)) {
    let url
    try { url = new URL(match[0].replace(/[.,;:!?)\]}'"]+$/, '')) }
    catch { throw new ChatContentError('bad_link', 'That link could not be read.') }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ChatContentError('bad_link', 'Only http and https links are allowed.')
    }
    if (!ALLOWED_LINK_HOSTS.has(url.hostname)) {
      throw new ChatContentError('bad_link', `Links to ${url.hostname} are not allowed in chat.`)
    }
  }

  text = text.replace(/([\\`*_~|])/g, '\\$1') // backslash first, or escapes get escaped

  // allowed_mentions blocks the ping but a role mention still renders as a
  // chip, so the syntax itself has to be broken.
  text = text.replace(/<(@|#|a?:|t:)/g, '< $1')

  text = text.split('\n').map((line) => line.replace(/^(\s*)([>#\-+]|\d+\.)/, '$1\\$2')).join('\n')

  // Array.from, not .slice — a code-unit slice can split a surrogate pair.
  const chars = Array.from(text)
  if (chars.length > OUTBOUND_HARD_CAP) text = chars.slice(0, OUTBOUND_HARD_CAP).join('')

  return text
}
