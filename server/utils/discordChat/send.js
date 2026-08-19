// Relays one site user's message into Discord through the channel webhook.
//
// See constants.js for the import rules.
//
// ── Rate limiting has two independent jobs ───────────────────────────────────
// Per-user limits stop one person flooding. They do NOT protect the webhook:
// Discord's execute limit is per-webhook (about 5 requests per 5 seconds), so
// twenty users each politely obeying a 5-second personal slowmode still produce
// ~4 requests/second and get throttled. The global token bucket is what keeps
// the relay inside Discord's ceiling, and it is the reason this runs in
// socket-server, which PM2 runs as a single fork instance — an in-process
// bucket there is globally correct, whereas the Nuxt tier runs two instances
// and would count every limit at half strength.
//
// All counters still live in Redis so they survive a restart and so a future
// second instance cannot double the effective allowance.

import { CHAT_KEYS, FLAG_SUPPRESS_EMBEDS } from './constants.js'
import { sanitizeOutbound, webhookDisplayName, avatarUrlFor, ChatContentError } from './sanitize.js'
import { executeWebhook, DiscordRestError } from './rest.js'

// Deliberately under Discord's per-webhook ceiling, leaving headroom for the
// other bot traffic this host generates (announcements, DMs, the guild cron).
const GLOBAL_MAX_PER_WINDOW = 4
const GLOBAL_WINDOW_SECONDS = 5

const BURST_MAX = 5
const BURST_WINDOW_SECONDS = 30
const HOURLY_MAX = 120
const IP_BURST_MAX = 10

// A relay is not a lock: if the limiter cannot be consulted, the request is
// refused rather than allowed. server/utils/lockRequest.js fails open, which is
// right for a lock and wrong here.
export class ChatRateError extends Error {
  constructor(reason, message, retryAfterMs = 0) {
    super(message)
    this.name = 'ChatRateError'
    this.reason = reason
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Per-user minimum gap. `SET NX EX` is the whole mechanism: it is atomic, so
 * two concurrent sends cannot both observe an empty slot.
 */
async function enforceSlowmode(redis, userId, seconds) {
  if (seconds <= 0) return
  const ok = await redis.set(CHAT_KEYS.gap(userId), '1', 'EX', seconds, 'NX')
  if (ok !== 'OK') {
    const ttl = await redis.pttl(CHAT_KEYS.gap(userId))
    throw new ChatRateError('slowmode', 'You are sending messages too quickly.', Math.max(ttl, 0))
  }
}

/**
 * Fixed-window counter. INCR and EXPIRE go in one MULTI so a crash between them
 * cannot leave a key without a TTL, which would wedge the user permanently.
 */
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

/**
 * Applies every limit, in cheapest-first order.
 *
 * `ipHash` should already be hashed/encrypted by the caller — this module never
 * sees a raw IP.
 */
export async function enforceRateLimits(redis, { userId, ipHash, slowmodeSeconds }) {
  try {
    await enforceSlowmode(redis, userId, slowmodeSeconds)

    const now = Date.now()
    await enforceWindow(
      redis,
      CHAT_KEYS.burst(userId, Math.floor(now / (BURST_WINDOW_SECONDS * 1000))),
      BURST_MAX,
      BURST_WINDOW_SECONDS * 2,
      'burst',
      'You are sending messages too quickly.'
    )
    await enforceWindow(
      redis,
      CHAT_KEYS.hourly(userId, Math.floor(now / 3_600_000)),
      HOURLY_MAX,
      3600,
      'hourly',
      'You have hit the hourly chat limit.'
    )
    // Alt accounts are a known problem on this site (it already runs device
    // fingerprinting and VPN detection), and a Discord account is nearly free
    // to make, so a per-user limit alone is trivially evaded.
    if (ipHash) {
      await enforceWindow(
        redis,
        CHAT_KEYS.ipBurst(ipHash, Math.floor(now / (BURST_WINDOW_SECONDS * 1000))),
        IP_BURST_MAX,
        BURST_WINDOW_SECONDS * 2,
        'burst',
        'You are sending messages too quickly.'
      )
    }

    // Last, because it is the only limit that is not the user's own fault. If
    // the webhook is saturated by other people, release this user's slowmode
    // slot so "try again in a moment" is actually actionable rather than
    // colliding with their own cooldown.
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
    // Redis unreachable. Fail closed — see the note above.
    throw new ChatRateError('unavailable', 'Chat is unavailable right now.', 5000)
  }
}

/**
 * Sanitizes, rate-limits and relays. Returns the created Discord message id.
 *
 * The caller is responsible for having authenticated and authorized the user
 * (not banned, in the guild, not muted) — this function does not re-check that,
 * because doing so from here would need Prisma and this module is shared.
 */
export async function relayMessage(redis, { user, rawContent, config, webhook, baseUrl, ipHash }) {
  const content = sanitizeOutbound(rawContent, { maxLength: config.discordChatMaxLength })
  const username = webhookDisplayName(user.username)

  await enforceRateLimits(redis, {
    userId: user.id,
    ipHash,
    slowmodeSeconds: config.discordChatSlowmodeSeconds
  })

  const avatarUrl = avatarUrlFor(user.avatar, baseUrl)

  let created
  try {
    created = await executeWebhook(webhook, {
      content,
      username,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      // Hardcoded, never assembled from config or from the request. This is the
      // real control over mass-pings; the textual escaping in sanitize.js is
      // what stops the message merely *looking* like one.
      allowed_mentions: { parse: [] },
      // Stops a relayed link generating a preview card, which would otherwise
      // render an attacker-influenced image in the channel.
      flags: FLAG_SUPPRESS_EMBEDS
    })
  } catch (err) {
    if (err instanceof DiscordRestError) {
      if (err.status === 404) {
        // Discord's docs single this case out: repeatedly using a 404ing
        // webhook earns a temporary IP restriction, which would break every
        // Discord integration on this host. Back off hard rather than retry.
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

  // Who really sent this, for moderation. Deliberately Redis with a TTL rather
  // than a Postgres table: Discord already shows the site username on every
  // relayed message, so this only answers "which account was that?", and a
  // per-message table would become the highest-volume table in the schema
  // inside a year.
  if (messageId) {
    await redis.set(CHAT_KEYS.relay(messageId), user.id, 'EX', 30 * 24 * 3600).catch(() => {})
  }

  return messageId
}
