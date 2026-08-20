// Turns a raw Discord message into render-ready TOKENS — plain objects, never
// HTML strings. Everything in a Discord message is guild-member-controlled and
// gets shown to every logged-in site user, so the component renders tokens
// with v-for/{{ }} only, never v-html.

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

// Control chars, zero-width, bidi overrides, BOM — bidi in particular lets a
// display name render right-to-left and spoof another user.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

const MAX_NAME_LENGTH = 32
const MAX_CONTENT_LENGTH = 2000

export function safeName(raw, max = MAX_NAME_LENGTH) {
  const s = String(raw ?? '').normalize('NFKC').replace(INVISIBLE, '').trim()
  if (!s) return 'unknown'
  const chars = Array.from(s)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : s
}

// BigInt required: snowflakes exceed Number.MAX_SAFE_INTEGER.
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
  const index = discriminator === '0'
    ? Number((BigInt(id) >> 22n) % 6n)
    : Number.isFinite(Number(discriminator)) ? Number(discriminator) % 5 : 0
  return `${CDN}/embed/avatars/${index}.png`
}

// One pass, one regex — chained .replace() calls would let a resolved
// username re-trigger a later pass.
const TOKEN_RE = new RegExp(
  [
    '<(a?):(\\w{2,32}):(\\d{17,20})>', // 1 animated, 2 name, 3 id — emoji
    '<@!?(\\d{17,20})>', // 4 user id
    '<@&(\\d{17,20})>', // 5 role id
    '<#(\\d{17,20})>', // 6 channel id
    '</([\\w -]{1,100}):(\\d{17,20})>', // 7 command, 8 id
    '<t:(-?\\d{1,17})(?::([tTdDfFsSR]))?>', // 9 unix secs, 10 style
    '<id:([a-z-]+)(?::(\\d{17,20}))?>' // 11 nav kind
  ].join('|'),
  'g'
)

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

function pushText(out, text) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.type === 'text') last.value += text
  else out.push({ type: 'text', value: text })
}

// href comes from URL parsing, never the raw match — kills javascript:/data:.
// Markdown [label](url) is not linkified as such: the label is attacker text.
function tokenizeUrls(text, out) {
  let last = 0
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index
    const raw = match[0]
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, '')
    let url = null
    try { url = new URL(trimmed) } catch {}

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
      out.push({ type: 'mention', value: `@${ctx.users.get(m[4]) || 'unknown'}` })
    } else if (m[5]) {
      out.push({ type: 'mention', value: `@${ctx.roles.get(m[5]) || 'role'}` })
    } else if (m[6]) {
      out.push({ type: 'mention', value: `#${ctx.channels.get(m[6]) || 'channel'}` })
    } else if (m[8]) {
      out.push({ type: 'mention', value: `/${safeName(m[7], 40)}` })
    } else if (m[9]) {
      out.push({ type: 'time', at: Number(m[9]) * 1000, style: m[10] || 'f' })
    }
  }
  tokenizeUrls(text.slice(last), out)
}

// Code spans are split out first so mentions inside them stay literal.
export function tokenizeContent(content, ctx) {
  const text = String(content ?? '').normalize('NFKC').replace(INVISIBLE, '').slice(0, MAX_CONTENT_LENGTH)
  if (!text) return []

  const out = []
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
      out.push({ type: 'codeblock', value: part.slice(3, -3).replace(/^[\w+-]*\n/, '') })
    } else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      out.push({ type: 'code', value: part.slice(1, -1) })
    } else {
      tokenizeSegment(part, ctx, out)
    }
  }
  return out
}

// Host allow-list + /attachments/ path check, since the url is attacker
// chosen. Rendering only ever goes into <img>, never iframe/object/embed/CSS.
export function normalizeAttachments(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const a of list) {
    if (out.length >= MAX_RENDERED_ATTACHMENTS) break
    let url
    try { url = new URL(String(a?.url ?? '')) } catch { continue }
    if (url.protocol !== 'https:') continue
    if (!ALLOWED_ATTACHMENT_HOSTS.has(url.hostname)) continue
    if (!url.pathname.startsWith('/attachments/')) continue

    const width = Number(a?.width) || 0
    const height = Number(a?.height) || 0
    const size = Number(a?.size) || 0
    if (!width || !height) continue
    if (size > MAX_ATTACHMENT_BYTES) continue
    if (width * height > MAX_ATTACHMENT_PIXELS) continue

    const thumb = new URL(url.href)
    thumb.hostname = 'media.discordapp.net'
    thumb.searchParams.set('width', '400')

    // Discord CDN attachment links are signed and expire (~1 day).
    const expiresHex = url.searchParams.get('ex')
    const expiresAt = expiresHex ? parseInt(expiresHex, 16) * 1000 : null

    out.push({ url: thumb.href, width, height, name: safeName(a?.filename, 40), expiresAt: Number.isFinite(expiresAt) ? expiresAt : null })
  }
  return out
}

export function normalizeMessage(raw, { webhookId, guildId, nameCache, showAttachments } = {}) {
  if (!raw || !SNOWFLAKE.test(String(raw.id ?? ''))) return null

  const type = Number(raw.type ?? 0)
  if (!RENDERABLE_MESSAGE_TYPES.has(type)) return null

  const flags = Number(raw.flags ?? 0)
  if (flags & FLAG_EPHEMERAL) return null
  if (flags & FLAG_LOADING) return null
  if (flags & FLAG_COMPONENTS_V2) return null // content empty; lives in `components`

  const author = raw.author || {}
  const viaSite = Boolean(webhookId && String(raw.webhook_id ?? '') === String(webhookId))
  if (author.bot === true && !viaSite) return null // other bots (usually embeds/components)

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

  // Embeds are never rendered: their image/footer urls point at arbitrary
  // attacker-chosen hosts, which would leak viewer IP/UA from one pasted link.
  if (!tokens.length && !attachments.length) {
    if (raw.sticker_items?.length) tokens.push({ type: 'text', value: '[sticker]' })
    else if (raw.embeds?.length) tokens.push({ type: 'text', value: '[link preview]' })
    else if (raw.attachments?.length) tokens.push({ type: 'text', value: '[attachment]' })
    else return null
  }

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
    replyToId: type === 19 && SNOWFLAKE.test(String(raw.message_reference?.message_id ?? ''))
      ? String(raw.message_reference.message_id)
      : null
  }
}
