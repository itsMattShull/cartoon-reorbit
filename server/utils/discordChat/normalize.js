// Turns a raw Discord message into the shape the sidebar renders.
//
// See constants.js for the import rules.
//
// ── The security contract this file exists to enforce ────────────────────────
// Everything in a Discord message is controlled by whoever can join the guild:
// content, display names, emoji names, attachment filenames, reply snippets.
// All of it gets rendered to every logged-in site user, on every page, and the
// site has no CSP today. So the renderer is never handed a string to interpret.
//
// This module emits an array of TOKENS — `{ type, ... }` objects with plain
// string fields — and the component renders them with v-for and `{{ }}`. There
// is no path by which message text becomes markup. Concretely, the component
// must never use v-html, innerHTML, insertAdjacentHTML, `<component :is>`, or
// bind :style / :href / :src to a raw message field.
//
// The only two places a message can influence a URL are `link` tokens (whose
// href is validated by the URL parser below, so `javascript:` and `data:` can
// never survive) and `emoji` / avatar / attachment URLs, which are BUILT here
// from validated snowflakes rather than taken from the payload.

import {
  RENDERABLE_MESSAGE_TYPES,
  FLAG_EPHEMERAL,
  FLAG_LOADING,
  FLAG_COMPONENTS_V2,
  ALLOWED_ATTACHMENT_HOSTS,
  MAX_RENDERED_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_PIXELS
} from './constants.js'

const CDN = 'https://cdn.discordapp.com'

const SNOWFLAKE = /^\d{17,20}$/
const AVATAR_HASH = /^a?_?[0-9a-f]{32}$/i

// Control characters, zero-width joiners/spaces, bidi overrides and the BOM.
// Bidi overrides in particular are a live spoofing primitive in a message list:
// they let a display name render right-to-left and impersonate another user.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

const MAX_NAME_LENGTH = 32
const MAX_CONTENT_LENGTH = 2000

/** Strips invisibles, normalizes, and truncates a display name. */
export function safeName(raw, max = MAX_NAME_LENGTH) {
  const s = String(raw ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .trim()
  if (!s) return 'unknown'
  const chars = Array.from(s)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : s
}

/**
 * Avatar URL, built rather than trusted.
 *
 * The guild-member avatar wins over the global one, otherwise per-server
 * avatars never show. The default-avatar index MUST be computed with BigInt:
 * snowflakes exceed Number.MAX_SAFE_INTEGER, so `Number(id) >> 22` silently
 * gives the wrong answer for every user.
 */
export function avatarUrl(author, member, guildId) {
  const id = String(author?.id ?? '')
  if (!SNOWFLAKE.test(id)) return null

  const memberHash = String(member?.avatar ?? '')
  if (AVATAR_HASH.test(memberHash) && SNOWFLAKE.test(String(guildId ?? ''))) {
    return `${CDN}/guilds/${guildId}/users/${id}/avatars/${memberHash}.png?size=32`
  }
  const hash = String(author?.avatar ?? '')
  if (AVATAR_HASH.test(hash)) return `${CDN}/avatars/${id}/${hash}.png?size=32`

  const discriminator = String(author?.discriminator ?? '0')
  let index
  if (discriminator === '0') {
    index = Number((BigInt(id) >> 22n) % 6n)
  } else {
    const n = Number(discriminator)
    index = Number.isFinite(n) ? n % 5 : 0
  }
  return `${CDN}/embed/avatars/${index}.png`
}

// One pass, one regex. Chained .replace() calls are unsafe here: a resolved
// username containing something like `<#123>` would be re-parsed by the next
// pass, letting one user's display name forge another token type.
const TOKEN_RE = new RegExp(
  [
    '<(a?):(\\w{2,32}):(\\d{17,20})>', // 1 animated, 2 name, 3 id  — custom emoji
    '<@!?(\\d{17,20})>', //               4 user id
    '<@&(\\d{17,20})>', //                5 role id
    '<#(\\d{17,20})>', //                 6 channel id
    '</([\\w -]{1,100}):(\\d{17,20})>', //  7 command name, 8 id
    '<t:(-?\\d{1,17})(?::([tTdDfFsSR]))?>', // 9 unix seconds, 10 style
    '<id:([a-z-]+)(?::(\\d{17,20}))?>' //  11 nav kind, 12 id
  ].join('|'),
  'g'
)

// Deliberately narrow: a scheme we allow, then non-whitespace. Trailing
// punctuation is trimmed below so "see https://x.com." doesn't swallow the dot.
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

function pushText(out, text) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.type === 'text') last.value += text
  else out.push({ type: 'text', value: text })
}

/**
 * Splits text into link and text tokens.
 *
 * The href is produced by the URL parser, never by the regex. That is what
 * makes `javascript:`, `data:` and control-character-prefixed schemes
 * impossible to express, which a string test cannot guarantee.
 *
 * Markdown link syntax `[label](url)` is deliberately NOT rendered as a link:
 * the label is attacker-controlled, and a relayed message already carries a
 * real community member's name and avatar, so a masked link is the phishing
 * primitive here. The raw text is shown instead.
 */
function tokenizeUrls(text, out) {
  let last = 0
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index
    let raw = match[0]

    // Trailing punctuation is almost never part of the URL.
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, '')
    let url = null
    try {
      url = new URL(trimmed)
    } catch {
      url = null
    }

    pushText(out, text.slice(last, start))
    if (url && (url.protocol === 'http:' || url.protocol === 'https:')) {
      out.push({ type: 'link', href: url.href, value: trimmed, host: url.hostname })
      pushText(out, raw.slice(trimmed.length))
    } else {
      pushText(out, raw)
    }
    last = start + raw.length
  }
  pushText(out, text.slice(last))
}

function tokenizeSegment(text, ctx, out) {
  let last = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    tokenizeUrls(text.slice(last, m.index), out)
    last = m.index + m[0].length

    if (m[3]) {
      out.push({
        type: 'emoji',
        name: safeName(m[2], 32),
        url: `${CDN}/emojis/${m[3]}.webp?size=24&quality=lossless${m[1] === 'a' ? '&animated=true' : ''}`
      })
    } else if (m[4]) {
      // msg.mentions carries the resolved user objects, so this needs no REST
      // call. A mention can legitimately be absent from that array (the user
      // left the guild, or the token sits inside a code span), hence the
      // fallback rather than a non-null assertion.
      out.push({ type: 'mention', value: `@${ctx.users.get(m[4]) || 'unknown'}` })
    } else if (m[5]) {
      out.push({ type: 'mention', value: `@${ctx.roles.get(m[5]) || 'role'}` })
    } else if (m[6]) {
      out.push({ type: 'mention', value: `#${ctx.channels.get(m[6]) || 'channel'}` })
    } else if (m[8]) {
      out.push({ type: 'mention', value: `/${safeName(m[7], 40)}` })
    } else if (m[9]) {
      // Unix SECONDS, not milliseconds.
      out.push({ type: 'time', at: Number(m[9]) * 1000, style: m[10] || 'f' })
    } else if (m[11]) {
      pushText(out, '')
    }
  }
  tokenizeUrls(text.slice(last), out)
}

/**
 * Content -> tokens.
 *
 * Code spans and fenced blocks are split out FIRST and never have their
 * contents resolved, so a `<@123>` typed inside backticks stays literal rather
 * than being turned into someone's name.
 */
export function tokenizeContent(content, ctx) {
  const text = String(content ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .slice(0, MAX_CONTENT_LENGTH)
  if (!text) return []

  const out = []
  // Fenced blocks first, then inline spans, so ``` wins over `.
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
      const inner = part.slice(3, -3).replace(/^[\w+-]*\n/, '')
      out.push({ type: 'codeblock', value: inner })
    } else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      out.push({ type: 'code', value: part.slice(1, -1) })
    } else {
      tokenizeSegment(part, ctx, out)
    }
  }
  return out
}

/**
 * Attachments worth rendering as images.
 *
 * Host allow-list plus an /attachments/ path check, because the URL is
 * attacker-chosen. `content_type` is attacker-influenced too and is therefore
 * only a hint — safety comes from rendering exclusively into an <img>, which
 * cannot execute script whatever the bytes turn out to be. Nothing here is ever
 * routed into an iframe, object, embed, or a CSS background.
 *
 * Note the `ex` query parameter: Discord's attachment CDN URLs are SIGNED and
 * expire (roughly a day). It is surfaced so the client can show an "expired"
 * placeholder instead of a broken image for anything that has aged out of the
 * buffer.
 */
export function normalizeAttachments(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const a of list) {
    if (out.length >= MAX_RENDERED_ATTACHMENTS) break
    let url
    try {
      url = new URL(String(a?.url ?? ''))
    } catch {
      continue
    }
    if (url.protocol !== 'https:') continue
    if (!ALLOWED_ATTACHMENT_HOSTS.has(url.hostname)) continue
    if (!url.pathname.startsWith('/attachments/')) continue

    const width = Number(a?.width) || 0
    const height = Number(a?.height) || 0
    const size = Number(a?.size) || 0
    const isImage = width > 0 && height > 0
    if (!isImage) continue
    // Decompression-bomb and bandwidth guards.
    if (size > MAX_ATTACHMENT_BYTES) continue
    if (width * height > MAX_ATTACHMENT_PIXELS) continue

    // Ask the resizing host for something the 224px column can actually use.
    // The original is routinely several megabytes and 2000px wide, and every
    // open panel would download it.
    const thumb = new URL(url.href)
    thumb.hostname = 'media.discordapp.net'
    thumb.searchParams.set('width', '400')

    const expiresHex = url.searchParams.get('ex')
    const expiresAt = expiresHex ? parseInt(expiresHex, 16) * 1000 : null

    out.push({
      url: thumb.href,
      width,
      height,
      name: safeName(a?.filename, 40),
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null
    })
  }
  return out
}

/**
 * Raw gateway/REST message -> rendered shape, or null if it should be dropped.
 *
 * `nameCache` supplies channel and role names (populated from GUILD_CREATE), so
 * mention resolution costs no API calls.
 */
export function normalizeMessage(raw, { webhookId, guildId, nameCache, showAttachments } = {}) {
  if (!raw || !SNOWFLAKE.test(String(raw.id ?? ''))) return null

  // Allow-list, not deny-list: every other type has empty content and would
  // render as a blank row, and #general is exactly where join/boost/pin/
  // thread-created system messages live.
  const type = Number(raw.type ?? 0)
  if (!RENDERABLE_MESSAGE_TYPES.has(type)) return null

  const flags = Number(raw.flags ?? 0)
  if (flags & FLAG_EPHEMERAL) return null
  if (flags & FLAG_LOADING) return null
  // Components V2 messages carry empty content with everything in `components`.
  if (flags & FLAG_COMPONENTS_V2) return null

  const author = raw.author || {}
  const viaSite = Boolean(webhookId && String(raw.webhook_id ?? '') === String(webhookId))

  // Bots other than our own relay are dropped. Their output is usually embeds
  // or components, which this feature does not render, so they would otherwise
  // appear as a stream of blank rows.
  if (author.bot === true && !viaSite) return null

  const users = new Map()
  if (Array.isArray(raw.mentions)) {
    for (const u of raw.mentions) {
      if (!SNOWFLAKE.test(String(u?.id ?? ''))) continue
      users.set(String(u.id), safeName(u.member?.nick ?? u.global_name ?? u.username))
    }
  }

  const tokens = tokenizeContent(raw.content, {
    users,
    roles: nameCache?.roles ?? new Map(),
    channels: nameCache?.channels ?? new Map()
  })

  const attachments = showAttachments ? normalizeAttachments(raw.attachments) : []

  // Nothing renderable: no text, no image, and embeds are deliberately not
  // rendered at all (an embed's image/footer URLs point at arbitrary
  // attacker-chosen hosts, which would beam every viewer's IP and User-Agent
  // to that host from one pasted link).
  const hasEmbedOnly = Array.isArray(raw.embeds) && raw.embeds.length > 0
  const hasSticker = Array.isArray(raw.sticker_items) && raw.sticker_items.length > 0
  if (!tokens.length && !attachments.length) {
    if (hasSticker) tokens.push({ type: 'text', value: '[sticker]' })
    else if (hasEmbedOnly) tokens.push({ type: 'text', value: '[link preview]' })
    else if (Array.isArray(raw.attachments) && raw.attachments.length) {
      tokens.push({ type: 'text', value: '[attachment]' })
    } else return null
  }

  // `member` is a partial guild member on gateway messages, and is absent for
  // webhook messages — hence the chain rather than a direct read.
  const display = viaSite
    ? safeName(author.username)
    : safeName(raw.member?.nick ?? author.global_name ?? author.username)

  return {
    id: String(raw.id),
    authorId: SNOWFLAKE.test(String(author.id ?? '')) ? String(author.id) : null,
    authorName: display,
    avatarUrl: avatarUrl(author, raw.member, guildId),
    tokens,
    attachments,
    createdAt: Date.parse(raw.timestamp) || Date.now(),
    editedAt: raw.edited_timestamp ? Date.parse(raw.edited_timestamp) : null,
    viaSite,
    replyToId:
      type === 19 && SNOWFLAKE.test(String(raw.message_reference?.message_id ?? ''))
        ? String(raw.message_reference.message_id)
        : null
  }
}
