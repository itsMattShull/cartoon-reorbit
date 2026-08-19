// Discord chat relay configuration.
//
// See server/utils/discordChat/constants.js for the import rules that apply to
// every module in this directory. Prisma is a parameter, never an import.
//
// Config lives in two places on purpose:
//   • Tunables (enabled, channel, slowmode, length, attachments) are on the
//     singleton GlobalGameConfig row, edited from Admin > Global Settings >
//     Discord, and cached in Redis so neither hot path reads Postgres per
//     message.
//   • The webhook credential is in env ONLY. Both admin config endpoints return
//     the GlobalGameConfig row wholesale, so a token stored there would be
//     serialized into every admin's browser on every settings load. A webhook
//     token is an unauthenticated bearer credential: anyone holding it can post
//     to the channel under any name and avatar, and it cannot be revoked by
//     rotating BOT_TOKEN — only by deleting the webhook.

import { CHAT_KEYS, CHAT_CHANNELS } from './constants.js'

const CONFIG_TTL_SECONDS = 60

export const CHAT_CONFIG_DEFAULTS = {
  discordChatEnabled: false,
  discordChatChannelId: null,
  discordChatSlowmodeSeconds: 5,
  discordChatMaxLength: 400,
  discordChatShowAttachments: false
}

/**
 * The bot token with any `Bot ` prefix removed.
 *
 * This matters more than it looks. .env.template ships BOT_TOKEN *with* the
 * prefix ("Bot xxx") because every REST caller in this repo passes it straight
 * through as an Authorization header. The gateway IDENTIFY payload is not an
 * HTTP header: it wants the bare token, and sending the prefixed value is
 * rejected with close code 4004 — which is `Reconnect: false`, so it presents
 * as a permanent authentication failure indistinguishable from a bad token.
 */
export function rawBotToken() {
  const token = process.env.DISCORD_CHAT_BOT_TOKEN || process.env.BOT_TOKEN || ''
  return token.trim().replace(/^bot\s+/i, '')
}

/**
 * Webhook credentials, from env only.
 *
 * Accepts either the full URL (what the Discord UI gives you when you click
 * "Copy Webhook URL") or the id/token pair, because operators will paste
 * whichever they have.
 */
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

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Reads the relay config, preferring a short-lived Redis cache.
 *
 * Falls back to the DB on a cache miss and to CHAT_CONFIG_DEFAULTS (i.e. disabled) if both
 * fail. Failing closed is deliberate: an unreadable config must never leave the
 * relay running with a stale channel id.
 */
export async function loadChatConfig(redis, prisma) {
  try {
    const cached = await redis.get(CHAT_KEYS.config)
    if (cached) return { ...CHAT_CONFIG_DEFAULTS, ...JSON.parse(cached) }
  } catch {
    // fall through to the DB
  }

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
  } catch {
    // caching is best-effort
  }
  return config
}

/**
 * Drops the cache and tells the other two processes to re-read.
 *
 * Called from the admin save handler. Without this the kill switch would only
 * take effect after the cache expired, or after a PM2 restart — which is
 * exactly when you least want to be restarting things.
 */
export async function invalidateChatConfig(redis) {
  try {
    await redis.del(CHAT_KEYS.config)
    await redis.publish(CHAT_CHANNELS.configChanged, String(Date.now()))
  } catch (err) {
    console.error('[DiscordChat] config invalidate failed:', err?.message || err)
  }
}
