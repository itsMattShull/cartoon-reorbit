// Shared constants for the Discord chat relay.
// Plain relative imports only — this is loaded from Nitro, socket-server.js,
// and the discord-chat worker, two of which are plain Node processes with no
// `@/` alias or Nitro globals.

export const CHAT_KEYS = {
  buffer: 'discordchat:buffer',
  session: 'discordchat:session',
  identifyLog: 'discordchat:identifylog',
  fatal: 'discordchat:fatal',
  config: 'discordchat:config',
  relay: (messageId) => `discordchat:relay:${messageId}`,
  gap: (userId) => `discordchat:gap:${userId}`,
  burst: (userId, window) => `discordchat:burst:${userId}:${window}`,
  hourly: (userId, hour) => `discordchat:hourly:${userId}:${hour}`,
  ipBurst: (ipHash, window) => `discordchat:ipburst:${ipHash}:${window}`,
  globalBucket: (window) => `discordchat:global:${window}`,
  webhookCooldown: 'discordchat:webhookcooldown'
}

export const CHAT_CHANNELS = {
  events: 'discordchat:events',
  configChanged: 'discordchat:config-changed'
}

export const BUFFER_SIZE = 50

// GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT. GUILDS gives us channel/role name
// caches from GUILD_CREATE for mention resolution with no extra REST calls.
export const INTENTS = (1 << 0) | (1 << 9) | (1 << 15) // 33281
export const GATEWAY_VERSION = 10

// Discord resets the bot token past 1000 IDENTIFYs/24h. Stay far under it.
export const IDENTIFY_LIMIT_PER_HOUR = 20
export const IDENTIFY_WINDOW_MS = 60 * 60 * 1000

// Reconnect:false codes — retrying these just burns IDENTIFY budget.
export const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014])
export const SESSION_INVALIDATING_CLOSE_CODES = new Set([4003, 4005, 4007, 4009, 1000, 1001])

// Allow-list, not deny-list: everything else (joins, boosts, pins, threads)
// carries empty content and would render as a blank row.
export const RENDERABLE_MESSAGE_TYPES = new Set([0, 19]) // DEFAULT, REPLY

export const FLAG_EPHEMERAL = 1 << 6
export const FLAG_LOADING = 1 << 7
export const FLAG_COMPONENTS_V2 = 1 << 15
export const FLAG_SUPPRESS_EMBEDS = 1 << 2

export const DISCORD_CONTENT_LIMIT = 2000
export const OUTBOUND_HARD_CAP = 1900

export const ALLOWED_ATTACHMENT_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net'])
export const MAX_RENDERED_ATTACHMENTS = 1
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
export const MAX_ATTACHMENT_PIXELS = 40_000_000
