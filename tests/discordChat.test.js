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
  try {
    fn()
    return null
  } catch (err) {
    return err instanceof ChatContentError ? err.reason : 'other'
  }
}

// ── Outbound: site -> Discord ────────────────────────────────────────────────

test('outbound refuses mass-ping attempts, including normalization bypasses', () => {
  assert.equal(reject(() => sanitizeOutbound('hi @everyone')), 'mention_blocked')
  assert.equal(reject(() => sanitizeOutbound('hi @here')), 'mention_blocked')
  // NFKC has to run BEFORE the check, or a fullwidth @ passes it and then decays
  // into a real mention on Discord's side.
  assert.equal(reject(() => sanitizeOutbound('hi ＠everyone')), 'mention_blocked')
})

test('outbound breaks mention syntax so a role cannot render as a chip', () => {
  // allowed_mentions stops the notification but the chip still renders, and the
  // chip is what people react to.
  const out = sanitizeOutbound('cc <@&555555555555555555>')
  assert.ok(!out.includes('<@&'), `role mention syntax survived: ${out}`)
})

test('outbound escapes markdown so relayed text cannot fake formatting', () => {
  const out = sanitizeOutbound('# Announcement **official**')
  assert.ok(out.startsWith('\\#'), `heading not escaped: ${out}`)
  assert.ok(out.includes('\\*\\*'), `bold not escaped: ${out}`)
})

test('outbound allows known hosts and refuses everything else', () => {
  assert.ok(sanitizeOutbound('see https://www.cartoonreorbit.com/newsite/home'))
  assert.equal(reject(() => sanitizeOutbound('free stuff https://evil.example/x')), 'bad_link')
  assert.equal(reject(() => sanitizeOutbound('join discord.gg/abc')), 'invite_blocked')
})

test('outbound enforces the configured length before escaping expands it', () => {
  assert.equal(reject(() => sanitizeOutbound('x'.repeat(50), { maxLength: 10 })), 'too_long')
  // 400 backticks escape to 800 characters; that must still be under the wire cap.
  const out = sanitizeOutbound('`'.repeat(400), { maxLength: 400 })
  assert.ok(out.length <= 1900, `escaped output exceeded the hard cap: ${out.length}`)
})

test('outbound rejects empty and whitespace-only messages', () => {
  assert.equal(reject(() => sanitizeOutbound('   ')), 'empty')
  assert.equal(reject(() => sanitizeOutbound('')), 'empty')
})

test('the webhook display name carries an unforgeable suffix', () => {
  // Setting a site username also sets the Discord guild nickname, so the two
  // share a namespace. Without a marker a relayed message is visually identical
  // to a real one from that member.
  const name = webhookDisplayName('QuirkyStormMercenary')
  assert.ok(name.includes('·'), 'no marker in the relayed display name')
  assert.ok(name.length <= 80, 'webhook usernames are capped at 80 characters')
  // A site username cannot contain the middot, so the suffix cannot be forged.
  assert.equal(reject(() => webhookDisplayName('Quirky · ReOrbit')), 'bad_username')
  // Discord 400s on these substrings.
  assert.equal(reject(() => webhookDisplayName('DiscordCoolGuy')), 'bad_username')
  assert.equal(reject(() => webhookDisplayName('not a real username')), 'bad_username')
})

test('the relayed avatar url is re-validated, not interpolated', () => {
  const base = 'https://www.cartoonreorbit.com'
  assert.equal(avatarUrlFor('1.png', base), `${base}/avatars/1.png`)
  // server/api/auth/set-avatar.post.js has no traversal guard, so the stored
  // value is not trustworthy on its own.
  assert.equal(avatarUrlFor('../cToons/secret.png', base), null)
  assert.equal(avatarUrlFor('', base), null)
  assert.equal(avatarUrlFor(null, base), null)
})

// ── Inbound: Discord -> site ─────────────────────────────────────────────────

test('inbound never produces a link token for a dangerous scheme', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x']) {
    const tokens = tokenizeContent(bad, ctx)
    assert.ok(
      tokens.every((t) => t.type !== 'link'),
      `${bad} produced a link token`
    )
  }
})

test('inbound does not render markdown link syntax as a link', () => {
  // The label is attacker-controlled and the message already carries a real
  // member's name and avatar, so a masked link is the phishing primitive here.
  const tokens = tokenizeContent('[totally safe](https://evil.example/phish)', ctx)
  const link = tokens.find((t) => t.type === 'link')
  assert.ok(link, 'expected the bare URL to still be linkified')
  assert.equal(link.value, 'https://evil.example/phish', 'the label must not become the link text')
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
  const tokens = tokenizeContent(
    '<@123456789012345678> <@&555555555555555555> <#777777777777777777>',
    { users, roles, channels }
  )
  const values = tokens.filter((t) => t.type === 'mention').map((t) => t.value)
  assert.deepEqual(values, ['@Alice', '@Moderator', '#general'])
})

test('display names are stripped of bidi overrides and zero-width characters', () => {
  // A right-to-left override in a display name is a live spoofing primitive in
  // a message list.
  const spoofed = `Ali${String.fromCharCode(0x202e)}ce${String.fromCharCode(0x200b)}`
  assert.equal(safeName(spoofed), 'Alice')
  assert.equal(safeName(''), 'unknown')
  assert.ok(safeName('x'.repeat(100)).length <= 33)
})

test('the default avatar index uses BigInt', () => {
  // Snowflakes exceed Number.MAX_SAFE_INTEGER, so Number(id) >> 22 is wrong for
  // every user.
  const id = '859384984934198272'
  const expected = Number((BigInt(id) >> 22n) % 6n)
  assert.equal(
    avatarUrl({ id, discriminator: '0' }, null, null),
    `https://cdn.discordapp.com/embed/avatars/${expected}.png`
  )
})

test('only renderable message types survive normalization', () => {
  const base = { id: '1'.repeat(18), author: { id: '2'.repeat(18) }, content: 'hi', timestamp: new Date().toISOString() }
  assert.ok(normalizeMessage({ ...base, type: 0 }), 'type 0 should render')
  assert.ok(normalizeMessage({ ...base, type: 19 }), 'type 19 (reply) should render')
  // #general is full of these and they all carry empty content.
  for (const type of [1, 2, 6, 7, 8, 18, 22, 46]) {
    assert.equal(normalizeMessage({ ...base, type }), null, `type ${type} should be dropped`)
  }
  // Components V2 puts everything in `components` and leaves content empty.
  assert.equal(normalizeMessage({ ...base, type: 0, flags: 1 << 15 }), null)
})

test('attachments are host-allow-listed and capped', () => {
  const ok = normalizeAttachments([
    { url: 'https://cdn.discordapp.com/attachments/1/2/a.png', width: 100, height: 100, size: 1000, filename: 'a.png' }
  ])
  assert.equal(ok.length, 1)
  assert.equal(new URL(ok[0].url).hostname, 'media.discordapp.net', 'should use the resizing host')

  // Wrong host, wrong path, oversized, and bomb-shaped inputs are all dropped.
  assert.deepEqual(normalizeAttachments([{ url: 'https://evil.example/a.png', width: 10, height: 10, size: 10 }]), [])
  assert.deepEqual(normalizeAttachments([{ url: 'https://cdn.discordapp.com/other/a.png', width: 10, height: 10, size: 10 }]), [])
  assert.deepEqual(
    normalizeAttachments([{ url: 'https://cdn.discordapp.com/attachments/1/2/a.png', width: 10, height: 10, size: 99 * 1024 * 1024 }]),
    []
  )
  assert.deepEqual(
    normalizeAttachments([{ url: 'https://cdn.discordapp.com/attachments/1/2/a.png', width: 99999, height: 99999, size: 10 }]),
    []
  )

  // Only one image per message is rendered, whatever arrives.
  const many = Array.from({ length: 5 }, (_, i) => ({
    url: `https://cdn.discordapp.com/attachments/1/2/${i}.png`, width: 10, height: 10, size: 10, filename: `${i}.png`
  }))
  assert.equal(normalizeAttachments(many).length, 1)
})

test('embeds are never rendered', () => {
  // An embed's image/footer URLs point at arbitrary attacker-chosen hosts, so
  // rendering one would beam every viewer's IP and User-Agent to that host from
  // a single pasted link.
  const m = normalizeMessage({
    id: '1'.repeat(18),
    type: 0,
    author: { id: '2'.repeat(18) },
    content: '',
    embeds: [{ image: { url: 'https://tracker.example/pixel.png' } }],
    timestamp: new Date().toISOString()
  })
  const serialized = JSON.stringify(m)
  assert.ok(!serialized.includes('tracker.example'), 'an embed URL reached the client payload')
})

test('our own relayed messages are flagged by webhook id, not by name', () => {
  // A guild member can set their nickname to any site username, so matching on
  // the display name would let them forge the "sent from the site" marker.
  const raw = {
    id: '1'.repeat(18),
    type: 0,
    content: 'hello',
    webhook_id: '9'.repeat(18),
    author: { id: '9'.repeat(18), username: 'QuirkyStormMercenary · ReOrbit', bot: true },
    timestamp: new Date().toISOString()
  }
  assert.equal(normalizeMessage(raw, { webhookId: '9'.repeat(18) })?.viaSite, true)
  assert.equal(normalizeMessage(raw, { webhookId: '8'.repeat(18) }), null, 'a foreign bot message should be dropped')
})

// ── Renderer contract ────────────────────────────────────────────────────────

test('the chat component never interpolates message data into markup', () => {
  const src = read('components/newsite/DiscordChat.vue')
  for (const banned of ['v-html', 'innerHTML', 'insertAdjacentHTML', 'outerHTML', 'document.write']) {
    assert.ok(!src.includes(banned), `DiscordChat.vue uses ${banned} — message content is attacker-controlled`)
  }
})

test('the chat composer sets an explicit colour', () => {
  // assets/css/tailwind.css @layer base sets `textarea { color: #111827 }` for
  // the ~1300 fields on light backgrounds. On the dark chat panel that renders
  // invisible, and formFieldContrast.test.js will not catch it because that test
  // only inspects Tailwind-classed fields.
  // Comments are stripped first: the rule documents a `textarea { ... }` base
  // rule inside a comment, and that brace would end the match early.
  const src = read('components/newsite/DiscordChat.vue').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = src.match(/\.dchat-input\s*\{[^}]*\}/)
  assert.ok(rule, 'no .dchat-input rule found')
  assert.match(rule[0], /color:\s*#ffffff/i, 'the composer must set its own colour')
  assert.ok(
    !/-webkit-text-fill-color/.test(rule[0]),
    'do not set -webkit-text-fill-color here — see the note in assets/css/tailwind.css'
  )
  // iOS zooms the page on focus for anything under 16px and does not zoom back.
  assert.match(src, /font-size:\s*16px/, 'the composer needs a 16px font size on mobile')
})

test('the sidebar chat region is not given a fixed height', () => {
  // --sidebar-middle-height is overridden by five pages (384-504px) and
  // .sidebar-bottom pins itself with margin-top:auto, so any hard-coded height
  // would gap on some routes and be clipped on others.
  const layout = read('layouts/newsite-template.vue')
  const rule = layout.match(/\.sidebar-chat\s*\{[^}]*\}/)
  assert.ok(rule, 'no .sidebar-chat rule found')
  assert.match(rule[0], /flex:\s*1 1 auto/, '.sidebar-chat must flex to fill the sidebar')
  // Without min-height:0 the flex item refuses to shrink and the composer is
  // clipped away by .sidebar { overflow: hidden }.
  assert.match(rule[0], /min-height:\s*0/, '.sidebar-chat must set min-height: 0')
})

test('the webhook credential is not stored in the database', () => {
  // Both admin config endpoints return the GlobalGameConfig row wholesale, so a
  // token column would be serialized into every admin's browser.
  const schema = read('prisma/schema.prisma')
  assert.ok(
    !/discordChatWebhook(Token|Id|Url)/i.test(schema),
    'the webhook credential must live in env, never on GlobalGameConfig'
  )
})

test('outbound bounds the payload before doing string work on it', () => {
  // An authenticated client can emit anything. NFKC + several regex passes over
  // a multi-megabyte string would stall the socket server's event loop, which
  // also runs the live games.
  assert.equal(reject(() => sanitizeOutbound('x'.repeat(5_000_000), { maxLength: 400 })), 'too_long')
  assert.equal(reject(() => sanitizeOutbound({ toString: () => 'x' })), 'too_long')
  assert.equal(reject(() => sanitizeOutbound(12345)), 'too_long')
})
