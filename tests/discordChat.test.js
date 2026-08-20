import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { sanitizeOutbound, webhookDisplayName, avatarUrlFor, ChatContentError } from '../server/utils/discordChat/sanitize.js'
import { tokenizeContent, normalizeMessage, safeName, avatarUrl, normalizeAttachments } from '../server/utils/discordChat/normalize.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, '..', p), 'utf8')

const ctx = { users: new Map(), roles: new Map(), channels: new Map() }
const reject = (fn) => {
  try { fn(); return null }
  catch (err) { return err instanceof ChatContentError ? err.reason : 'other' }
}

// ── Outbound: site -> Discord ────────────────────────────────────────────────

test('outbound refuses mass-ping attempts, including a fullwidth bypass', () => {
  assert.equal(reject(() => sanitizeOutbound('hi @everyone')), 'mention_blocked')
  assert.equal(reject(() => sanitizeOutbound('hi @here')), 'mention_blocked')
  assert.equal(reject(() => sanitizeOutbound('hi ＠everyone')), 'mention_blocked') // NFKC must run first
})

test('outbound breaks role-mention syntax, not just allowed_mentions', () => {
  const out = sanitizeOutbound('cc <@&555555555555555555>')
  assert.ok(!out.includes('<@&'), `role mention syntax survived: ${out}`)
})

test('outbound escapes markdown', () => {
  const out = sanitizeOutbound('# Announcement **official**')
  assert.ok(out.startsWith('\\#'))
  assert.ok(out.includes('\\*\\*'))
})

test('outbound allows known hosts and refuses everything else', () => {
  assert.ok(sanitizeOutbound('see https://www.cartoonreorbit.com/newsite/home'))
  assert.equal(reject(() => sanitizeOutbound('free stuff https://evil.example/x')), 'bad_link')
  assert.equal(reject(() => sanitizeOutbound('join discord.gg/abc')), 'invite_blocked')
})

test('outbound enforces length before escaping expands it', () => {
  assert.equal(reject(() => sanitizeOutbound('x'.repeat(50), { maxLength: 10 })), 'too_long')
  const out = sanitizeOutbound('`'.repeat(400), { maxLength: 400 })
  assert.ok(out.length <= 1900, `escaped output exceeded the hard cap: ${out.length}`)
})

test('outbound rejects empty and whitespace-only messages', () => {
  assert.equal(reject(() => sanitizeOutbound('   ')), 'empty')
  assert.equal(reject(() => sanitizeOutbound('')), 'empty')
})

test('outbound bounds payload size before doing string work on it', () => {
  assert.equal(reject(() => sanitizeOutbound('x'.repeat(5_000_000), { maxLength: 400 })), 'too_long')
  assert.equal(reject(() => sanitizeOutbound({ toString: () => 'x' })), 'too_long')
  assert.equal(reject(() => sanitizeOutbound(12345)), 'too_long')
})

test('webhook display name carries an unforgeable suffix and blocks reserved words', () => {
  const name = webhookDisplayName('QuirkyStormMercenary')
  assert.ok(name.includes('·'))
  assert.ok(name.length <= 80)
  assert.equal(reject(() => webhookDisplayName('Quirky · ReOrbit')), 'bad_username') // can't occur in a real username
  assert.equal(reject(() => webhookDisplayName('DiscordCoolGuy')), 'bad_username')
  assert.equal(reject(() => webhookDisplayName('not a real username')), 'bad_username')
})

test('relayed avatar url is re-validated, not interpolated', () => {
  const base = 'https://www.cartoonreorbit.com'
  assert.equal(avatarUrlFor('1.png', base), `${base}/avatars/1.png`)
  assert.equal(avatarUrlFor('../cToons/secret.png', base), null) // set-avatar.post.js has no traversal guard
  assert.equal(avatarUrlFor('', base), null)
  assert.equal(avatarUrlFor(null, base), null)
})

// ── Inbound: Discord -> site ─────────────────────────────────────────────────

test('inbound never produces a link token for a dangerous scheme', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x']) {
    const tokens = tokenizeContent(bad, ctx)
    assert.ok(tokens.every((t) => t.type !== 'link'), `${bad} produced a link token`)
  }
})

test('inbound does not linkify markdown link syntax (label is attacker text)', () => {
  const tokens = tokenizeContent('[totally safe](https://evil.example/phish)', ctx)
  const link = tokens.find((t) => t.type === 'link')
  assert.ok(link)
  assert.equal(link.value, 'https://evil.example/phish')
})

test('inbound leaves markup inert as text', () => {
  const tokens = tokenizeContent('<img src=x onerror=alert(1)>', ctx)
  assert.deepEqual(tokens, [{ type: 'text', value: '<img src=x onerror=alert(1)>' }])
})

test('inbound does not resolve mentions inside code spans', () => {
  const users = new Map([['123456789012345678', 'Alice']])
  const tokens = tokenizeContent('`<@123456789012345678>`', { ...ctx, users })
  assert.deepEqual(tokens, [{ type: 'code', value: '<@123456789012345678>' }])
})

test('inbound resolves mentions from the payload with no API call', () => {
  const users = new Map([['123456789012345678', 'Alice']])
  const roles = new Map([['555555555555555555', 'Moderator']])
  const channels = new Map([['777777777777777777', 'general']])
  const tokens = tokenizeContent('<@123456789012345678> <@&555555555555555555> <#777777777777777777>', { users, roles, channels })
  assert.deepEqual(tokens.filter((t) => t.type === 'mention').map((t) => t.value), ['@Alice', '@Moderator', '#general'])
})

test('display names strip bidi overrides and zero-width characters', () => {
  const spoofed = `Ali${String.fromCharCode(0x202e)}ce${String.fromCharCode(0x200b)}`
  assert.equal(safeName(spoofed), 'Alice')
  assert.equal(safeName(''), 'unknown')
  assert.ok(safeName('x'.repeat(100)).length <= 33)
})

test('default avatar index uses BigInt (snowflakes exceed MAX_SAFE_INTEGER)', () => {
  const id = '859384984934198272'
  const expected = Number((BigInt(id) >> 22n) % 6n)
  assert.equal(avatarUrl({ id, discriminator: '0' }, null, null), `https://cdn.discordapp.com/embed/avatars/${expected}.png`)
})

test('only renderable message types survive normalization', () => {
  const base = { id: '1'.repeat(18), author: { id: '2'.repeat(18) }, content: 'hi', timestamp: new Date().toISOString() }
  assert.ok(normalizeMessage({ ...base, type: 0 }))
  assert.ok(normalizeMessage({ ...base, type: 19 }))
  for (const type of [1, 2, 6, 7, 8, 18, 22, 46]) {
    assert.equal(normalizeMessage({ ...base, type }), null, `type ${type} should be dropped`)
  }
  assert.equal(normalizeMessage({ ...base, type: 0, flags: 1 << 15 }), null) // Components V2
})

test('attachments are host-allow-listed and capped', () => {
  const ok = normalizeAttachments([
    { url: 'https://cdn.discordapp.com/attachments/1/2/a.png', width: 100, height: 100, size: 1000, filename: 'a.png' }
  ])
  assert.equal(ok.length, 1)
  assert.equal(new URL(ok[0].url).hostname, 'media.discordapp.net')

  assert.deepEqual(normalizeAttachments([{ url: 'https://evil.example/a.png', width: 10, height: 10, size: 10 }]), [])
  assert.deepEqual(normalizeAttachments([{ url: 'https://cdn.discordapp.com/other/a.png', width: 10, height: 10, size: 10 }]), [])
  assert.deepEqual(normalizeAttachments([{ url: 'https://cdn.discordapp.com/attachments/1/2/a.png', width: 10, height: 10, size: 99 * 1024 * 1024 }]), [])
  assert.deepEqual(normalizeAttachments([{ url: 'https://cdn.discordapp.com/attachments/1/2/a.png', width: 99999, height: 99999, size: 10 }]), [])

  const many = Array.from({ length: 5 }, (_, i) => ({
    url: `https://cdn.discordapp.com/attachments/1/2/${i}.png`, width: 10, height: 10, size: 10, filename: `${i}.png`
  }))
  assert.equal(normalizeAttachments(many).length, 1)
})

test('embeds are never rendered (their image urls point at arbitrary hosts)', () => {
  const m = normalizeMessage({
    id: '1'.repeat(18), type: 0, author: { id: '2'.repeat(18) }, content: '',
    embeds: [{ image: { url: 'https://tracker.example/pixel.png' } }],
    timestamp: new Date().toISOString()
  })
  assert.ok(!JSON.stringify(m).includes('tracker.example'))
})

test('relayed messages are flagged by webhook id, not by display name', () => {
  const raw = {
    id: '1'.repeat(18), type: 0, content: 'hello', webhook_id: '9'.repeat(18),
    author: { id: '9'.repeat(18), username: 'QuirkyStormMercenary · ReOrbit', bot: true },
    timestamp: new Date().toISOString()
  }
  assert.equal(normalizeMessage(raw, { webhookId: '9'.repeat(18) })?.viaSite, true)
  assert.equal(normalizeMessage(raw, { webhookId: '8'.repeat(18) }), null) // foreign bot message dropped
})

// ── Renderer contract ────────────────────────────────────────────────────────

test('the chat component never interpolates message data into markup', () => {
  const src = read('components/newsite/DiscordChat.vue')
  for (const banned of ['v-html', 'innerHTML', 'insertAdjacentHTML', 'outerHTML', 'document.write']) {
    assert.ok(!src.includes(banned), `DiscordChat.vue uses ${banned}`)
  }
})

test('the chat composer sets an explicit colour and a 16px mobile font size', () => {
  const src = read('components/newsite/DiscordChat.vue').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = src.match(/\.dchat-input\s*\{[^}]*\}/)
  assert.ok(rule)
  assert.match(rule[0], /color:\s*#ffffff/i)
  assert.ok(!/-webkit-text-fill-color/.test(rule[0]))
  assert.match(src, /font-size:\s*16px/) // prevents iOS auto-zoom on focus
})

test('the sidebar chat region is not given a fixed height', () => {
  const layout = read('layouts/newsite-template.vue')
  const rule = layout.match(/\.sidebar-chat\s*\{[^}]*\}/)
  assert.ok(rule)
  assert.match(rule[0], /flex:\s*1 1 auto/)
  assert.match(rule[0], /min-height:\s*0/)
})

test('the webhook credential is not stored in the database', () => {
  const schema = read('prisma/schema.prisma')
  assert.ok(!/discordChatWebhook(Token|Id|Url)/i.test(schema))
})
