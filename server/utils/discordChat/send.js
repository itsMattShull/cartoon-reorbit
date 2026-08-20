// Relays one site user's message into Discord via the channel webhook.
//
// Two rate-limit layers: per-user limits stop one person flooding, but
// Discord's execute limit is per-WEBHOOK (~5 req/5s), so N users each
// obeying a personal slowmode can still blow past it. The global bucket
// covers that, and works because socket-server (where this runs) is a
// single PM2 instance — an in-process bucket is globally correct there.

import { CHAT_KEYS, FLAG_SUPPRESS_EMBEDS } from './constants.js'
import { sanitizeOutbound, webhookDisplayName, avatarUrlFor, ChatContentError } from './sanitize.js'
import { executeWebhook, DiscordRestError } from './rest.js'

const GLOBAL_MAX_PER_WINDOW = 4
const GLOBAL_WINDOW_SECONDS = 5
const BURST_MAX = 5
const BURST_WINDOW_SECONDS = 30
const HOURLY_MAX = 120
const IP_BURST_MAX = 10

// Fails closed (unlike server/utils/lockRequest.js, which fails open) —
// right for a lock, wrong for a public-facing relay.
export class ChatRateError extends Error {
  constructor(reason, message, retryAfterMs = 0) {
    super(message)
    this.name = 'ChatRateError'
    this.reason = reason
    this.retryAfterMs = retryAfterMs
  }
}

async function enforceSlowmode(redis, userId, seconds) {
  if (seconds <= 0) return
  const ok = await redis.set(CHAT_KEYS.gap(userId), '1', 'EX', seconds, 'NX')
  if (ok !== 'OK') {
    const ttl = await redis.pttl(CHAT_KEYS.gap(userId))
    throw new ChatRateError('slowmode', 'You are sending messages too quickly.', Math.max(ttl, 0))
  }
}

async function enforceWindow(redis, key, max, windowSeconds, reason, message) {
  const [[, count]] = await redis.multi().incr(key).expire(key, windowSeconds).exec()
  if (count > max) {
    const ttl = await redis.pttl(key)
    throw new ChatRateError(reason, message, Math.max(ttl, 0))
  }
}

async function enforceGlobalBucket(redis) {
  const window = Math.floor(Date.now() / (GLOBAL_WINDOW_SECONDS * 1000))
  const key = CHAT_KEYS.globalBucket(window)
  const [[, count]] = await redis.multi().incr(key).expire(key, GLOBAL_WINDOW_SECONDS * 2).exec()
  if (count > GLOBAL_MAX_PER_WINDOW) {
    throw new ChatRateError('busy', 'Chat is busy right now — try again in a moment.', GLOBAL_WINDOW_SECONDS * 1000)
  }
}

export async function enforceRateLimits(redis, { userId, ipHash, slowmodeSeconds }) {
  try {
    await enforceSlowmode(redis, userId, slowmodeSeconds)

    const now = Date.now()
    await enforceWindow(redis, CHAT_KEYS.burst(userId, Math.floor(now / (BURST_WINDOW_SECONDS * 1000))),
      BURST_MAX, BURST_WINDOW_SECONDS * 2, 'burst', 'You are sending messages too quickly.')
    await enforceWindow(redis, CHAT_KEYS.hourly(userId, Math.floor(now / 3_600_000)),
      HOURLY_MAX, 3600, 'hourly', 'You have hit the hourly chat limit.')

    // Alt-account layer: Discord accounts are nearly free to make.
    if (ipHash) {
      await enforceWindow(redis, CHAT_KEYS.ipBurst(ipHash, Math.floor(now / (BURST_WINDOW_SECONDS * 1000))),
        IP_BURST_MAX, BURST_WINDOW_SECONDS * 2, 'burst', 'You are sending messages too quickly.')
    }

    // Last, because it's not the user's own fault: release their slowmode
    // slot if the WEBHOOK is what's saturated, so "try again" is actionable.
    try {
      await enforceGlobalBucket(redis)
    } catch (err) {
      if (err instanceof ChatRateError && err.reason === 'busy') {
        await redis.del(CHAT_KEYS.gap(userId)).catch(() => {})
      }
      throw err
    }
  } catch (err) {
    if (err instanceof ChatRateError) throw err
    throw new ChatRateError('unavailable', 'Chat is unavailable right now.', 5000)
  }
}

// Caller must already have authorized the user (banned/inGuild/muted) —
// that check needs Prisma and this module is shared with plain-Node procs.
export async function relayMessage(redis, { user, rawContent, config, webhook, baseUrl, ipHash }) {
  const content = sanitizeOutbound(rawContent, { maxLength: config.discordChatMaxLength })
  const username = webhookDisplayName(user.username)

  await enforceRateLimits(redis, { userId: user.id, ipHash, slowmodeSeconds: config.discordChatSlowmodeSeconds })

  const avatarUrl = avatarUrlFor(user.avatar, baseUrl)

  let created
  try {
    created = await executeWebhook(webhook, {
      content,
      username,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      allowed_mentions: { parse: [] },
      flags: FLAG_SUPPRESS_EMBEDS
    })
  } catch (err) {
    if (err instanceof DiscordRestError) {
      if (err.status === 404) {
        // Discord docs: reusing a 404ing webhook risks an IP restriction.
        await redis.set(CHAT_KEYS.webhookCooldown, '1', 'EX', 300).catch(() => {})
        throw new ChatRateError('unavailable', 'Chat is misconfigured. An admin has been notified.')
      }
      if (err.status === 429) {
        throw new ChatRateError('busy', 'Chat is busy right now — try again in a moment.', err.retryAfterMs)
      }
      if (err.code === 50035) {
        throw new ChatContentError('bad_username', 'Your username cannot be used in chat.')
      }
    }
    throw new ChatRateError('unavailable', 'Could not reach Discord. Your message was not sent.')
  }

  const messageId = created?.id ? String(created.id) : null

  // Redis with a TTL, not a Postgres table: Discord already shows the site
  // username on every relayed message, so this only maps "which account".
  if (messageId) {
    await redis.set(CHAT_KEYS.relay(messageId), user.id, 'EX', 30 * 24 * 3600).catch(() => {})
  }

  return messageId
}
