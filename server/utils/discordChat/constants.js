// Shared constants for the Discord chat relay.
//
// ── Import rules (please read before editing) ────────────────────────────────
// Every module under server/utils/discordChat/ is imported from THREE runtimes:
//   • Nuxt API handlers / admin endpoints, as '@/server/utils/discordChat/...'
//   • server/socket-server.js, as './utils/discordChat/...'
//   • server/workers/discord-chat.worker.js, likewise relative
//
// The last two are plain `node foo.js` processes. The `@/` alias, `#imports`
// and Nitro's `$fetch` global are Nuxt/Vite-only and are NOT available there —
// see the header of server/utils/notifications.js for the same rule and the
// reason it is written down. So: relative imports only, global `fetch` only,
// and Prisma is passed in as a parameter rather than imported.
//
// Note server/utils/discord.js cannot be imported wholesale from the plain-Node
// side either: several of its helpers call `$fetch`. The pieces this feature
// needs are re-exported from there through globalThis.fetch-based wrappers.

// ── Redis keys ───────────────────────────────────────────────────────────────
// One namespace so an operator can see the whole feature's state with
// `KEYS discordchat:*` and drop it with a single scan.
export const CHAT_KEYS = {
  // Ring buffer of normalized messages, newest first (LPUSH + LTRIM).
  buffer: 'discordchat:buffer',
  // Gateway session so a deploy RESUMEs instead of burning an IDENTIFY.
  session: 'discordchat:session',
  // Rolling IDENTIFY timestamps. Persisted because the failure this guards
  // against is a PM2 crash-loop, which resets any in-memory counter.
  identifyLog: 'discordchat:identifylog',
  // Terminal gateway failure, surfaced to clients and to the admin panel.
  fatal: 'discordchat:fatal',
  // Cached copy of the DB config, so neither hot path hits Postgres per message.
  config: 'discordchat:config',
  // messageId -> userId for messages this site relayed. Lets a moderator answer
  // "who actually sent this?" without a Postgres table that grows forever.
  relay: (messageId) => `discordchat:relay:${messageId}`,
  // Rate limiting.
  gap: (userId) => `discordchat:gap:${userId}`,
  burst: (userId, window) => `discordchat:burst:${userId}:${window}`,
  hourly: (userId, hour) => `discordchat:hourly:${userId}:${hour}`,
  ipBurst: (ipHash, window) => `discordchat:ipburst:${ipHash}:${window}`,
  globalBucket: (window) => `discordchat:global:${window}`,
  // Set when a webhook 404s. Discord's docs are explicit that repeatedly using
  // a 404ing webhook earns a temporary IP restriction, so re-resolution is
  // gated behind this rather than retried per message.
  webhookCooldown: 'discordchat:webhookcooldown'
}

// Pub/sub channels between the three processes.
export const CHAT_CHANNELS = {
  // gateway worker -> socket-server: a normalized message event to fan out.
  events: 'discordchat:events',
  // Nuxt admin endpoint -> gateway worker + socket-server: config changed.
  // Without this, the kill switch would need a PM2 restart, which defeats it.
  configChanged: 'discordchat:config-changed'
}

// ── Ring buffer ──────────────────────────────────────────────────────────────
// 50 is what a client gets on join. Clients keep more than this in the DOM, so
// delete events must be emitted unconditionally rather than only when the id is
// still inside this window.
export const BUFFER_SIZE = 50

// ── Gateway ──────────────────────────────────────────────────────────────────
// GUILDS (1<<0) | GUILD_MESSAGES (1<<9) | MESSAGE_CONTENT (1<<15).
//
// GUILD_MESSAGES alone is enough to receive MESSAGE_CREATE, and GUILDS costs a
// large GUILD_CREATE payload on every connect. It is included anyway for three
// things nothing else provides:
//   1. GUILD_CREATE carries the guild's `channels` and `roles`, which is the
//      only way to render <#id> and <@&id> mentions as names without a REST
//      call per message.
//   2. CHANNEL_UPDATE / CHANNEL_DELETE is how we learn the configured channel
//      was renamed or deleted underneath us.
//   3. The configured channel being absent from GUILD_CREATE.channels is the
//      ONLY signal that the bot has lost VIEW_CHANNEL. Without it, losing that
//      permission presents as "connected, but nobody is talking" — silent, and
//      undiagnosable from logs.
// The payload is parsed for those three things and then dropped, not retained.
export const INTENTS = (1 << 0) | (1 << 9) | (1 << 15) // 33281

export const GATEWAY_VERSION = 10

// Discord terminates all sessions AND RESETS THE BOT TOKEN if an app exceeds
// 1000 IDENTIFYs in 24h. BOT_TOKEN here is load-bearing for OAuth guild-join,
// DMs, achievement/auction announcements and the guild-sync cron, so tripping
// that would take down every Discord integration on the site at once, and the
// only recovery is a manual token rotation.
//
// A healthy client IDENTIFYs about once a day. 20 in an hour is already
// pathological, so it is treated as a permanent fault rather than something to
// retry through. Losing the chat sidebar for an hour is enormously cheaper.
export const IDENTIFY_LIMIT_PER_HOUR = 20
export const IDENTIFY_WINDOW_MS = 60 * 60 * 1000

// Close codes Discord documents as Reconnect: false. Retrying these is what
// burns the IDENTIFY budget above, so they are terminal.
//   4004 auth failed — nearly always the "Bot " prefix left on the token
//   4010 invalid shard, 4011 sharding required — we never shard
//   4012 invalid API version, 4013 invalid intents — our bug
//   4014 disallowed intents — MESSAGE CONTENT not enabled in the dev portal
export const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014])

// Close codes after which the session is gone and a fresh IDENTIFY is required.
// Everything else resumable is RESUMEd, which does not count against the budget.
export const SESSION_INVALIDATING_CLOSE_CODES = new Set([4003, 4005, 4007, 4009, 1000, 1001])

// ── Message filtering ────────────────────────────────────────────────────────
// An ALLOW-list, not a deny-list. Every other message type carries empty
// `content` and would render as a blank row, and Discord keeps adding types
// (36-39, 44 and 46 are all recent), so a deny-list silently starts leaking
// blank rows as the platform evolves.
//   0  = DEFAULT
//   19 = REPLY
export const RENDERABLE_MESSAGE_TYPES = new Set([0, 19])

// Message flags worth skipping.
//   1<<6  EPHEMERAL — shouldn't reach us; skip anyway
//   1<<7  LOADING — a bot "thinking" placeholder, edited later
//   1<<15 IS_COMPONENTS_V2 — content is empty and everything lives in
//         `components`, so these render as blank rows. Increasingly common.
export const FLAG_EPHEMERAL = 1 << 6
export const FLAG_LOADING = 1 << 7
export const FLAG_COMPONENTS_V2 = 1 << 15

// Discord's hard ceiling on message content. The admin-configured max is
// clamped to just under it so that escaping (which expands the string) cannot
// push a legal message over the wire limit.
export const DISCORD_CONTENT_LIMIT = 2000
export const OUTBOUND_HARD_CAP = 1900

// Suppresses link previews on relayed messages. Without it, an allow-listed URL
// still renders an attacker-influenced image card in the Discord channel.
export const FLAG_SUPPRESS_EMBEDS = 1 << 2

// ── Attachment rendering ─────────────────────────────────────────────────────
// Only these two hosts, and only under /attachments/. Anything else is rendered
// as a link chip instead of an <img>.
export const ALLOWED_ATTACHMENT_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net'])
export const MAX_RENDERED_ATTACHMENTS = 1
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
export const MAX_ATTACHMENT_PIXELS = 40_000_000
