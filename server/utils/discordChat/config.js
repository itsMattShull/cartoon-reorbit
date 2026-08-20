// Discord chat relay configuration.
//
// Tunables live on GlobalGameConfig (cached in Redis). The webhook credential
// lives in env ONLY — the admin config endpoints return that row wholesale to
// the browser, so a token column there would leak into every admin's devtools.

import { CHAT_KEYS, CHAT_CHANNELS } from './constants.js'

const CONFIG_TTL_SECONDS = 60

export const CHAT_CONFIG_DEFAULTS = {
  discordChatEnabled: false,
  discordChatChannelId: null,
  discordChatSlowmodeSeconds: 5,
  discordChatMaxLength: 400,
  discordChatShowAttachments: false
}

// Gateway IDENTIFY needs the bare token; .env stores it "Bot xxx" for REST use.
export function rawBotToken() {
  const token = process.env.DISCORD_CHAT_BOT_TOKEN || process.env.BOT_TOKEN || ''
  return token.trim().replace(/^bot\s+/i, '')
}

export function webhookCredentials() {
  const url = (process.env.DISCORD_CHAT_WEBHOOK_URL || '').trim()
  if (url) {
    const m = /\/webhooks\/(\d{17,20})\/([A-Za-z0-9_.-]+)/.exec(url)
    if (m) return { id: m[1], token: m[2] }
  }
  const id = (process.env.DISCORD_CHAT_WEBHOOK_ID || '').trim()
  const token = (process.env.DISCORD_CHAT_WEBHOOK_TOKEN || '').trim()
  if (/^\d{17,20}$/.test(id) && token) return { id, token }
  return null
}

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function coerce(row) {
  if (!row) return { ...CHAT_CONFIG_DEFAULTS }
  return {
    discordChatEnabled: row.discordChatEnabled === true,
    discordChatChannelId: /^\d{17,20}$/.test(String(row.discordChatChannelId || ''))
      ? String(row.discordChatChannelId)
      : null,
    discordChatSlowmodeSeconds: clampInt(row.discordChatSlowmodeSeconds, 0, 300, CHAT_CONFIG_DEFAULTS.discordChatSlowmodeSeconds),
    discordChatMaxLength: clampInt(row.discordChatMaxLength, 1, 2000, CHAT_CONFIG_DEFAULTS.discordChatMaxLength),
    discordChatShowAttachments: row.discordChatShowAttachments === true
  }
}

export async function loadChatConfig(redis, prisma) {
  try {
    const cached = await redis.get(CHAT_KEYS.config)
    if (cached) return { ...CHAT_CONFIG_DEFAULTS, ...JSON.parse(cached) }
  } catch {}

  let row = null
  try {
    row = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        discordChatEnabled: true,
        discordChatChannelId: true,
        discordChatSlowmodeSeconds: true,
        discordChatMaxLength: true,
        discordChatShowAttachments: true
      }
    })
  } catch (err) {
    console.error('[DiscordChat] config read failed:', err?.message || err)
    return { ...CHAT_CONFIG_DEFAULTS }
  }

  const config = coerce(row)
  try {
    await redis.set(CHAT_KEYS.config, JSON.stringify(config), 'EX', CONFIG_TTL_SECONDS)
  } catch {}
  return config
}

// Called after an admin save so the kill switch takes effect immediately
// instead of waiting out the cache TTL or a restart.
export async function invalidateChatConfig(redis) {
  try {
    await redis.del(CHAT_KEYS.config)
    await redis.publish(CHAT_CHANNELS.configChanged, String(Date.now()))
  } catch (err) {
    console.error('[DiscordChat] config invalidate failed:', err?.message || err)
  }
}
