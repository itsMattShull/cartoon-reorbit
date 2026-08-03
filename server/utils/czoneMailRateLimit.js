// server/utils/czoneMailRateLimit.js
//
// Redis-backed counters for the cMail send path. All three checks (global
// cooldown, per-pair cooldown, burst window) happen in ONE Lua script so they
// are atomic with respect to the 2 nuxt-server cluster instances.
//
// Doing it in separate round trips would allow two failure modes:
//   * INCR succeeding and the follow-up EXPIRE failing, leaving a counter with
//     no TTL — that sender would then be permanently over the burst threshold
//     and re-blocked forever, fixable only by a manual DEL;
//   * two concurrent requests both crossing the threshold and both writing a
//     spam-log row.
//
// The authoritative record of an active block lives in Postgres
// (User.czoneMailBlockedUntil), not here — a Redis flush or restart must not
// quietly cancel a punishment.

import { redis } from '../utils/redis.js'

// Versioned so a future change to the counter semantics can't inherit stale keys.
const PREFIX = 'cmail:v1'

const cooldownKey = (senderId) => `${PREFIX}:cd:${senderId}`
const windowKey   = (senderId) => `${PREFIX}:win:${senderId}`
const pairKey     = (senderId, recipientId) => `${PREFIX}:pair:${senderId}:${recipientId}`

// KEYS: 1=cooldown 2=window 3=pair
// ARGV: 1=cooldownSeconds 2=windowSeconds 3=pairSeconds
//
// Returns { blockedBy, retryAfterMs, windowCount }:
//   blockedBy 0 = allowed, 1 = global cooldown, 2 = pair cooldown
// On the allowed path it consumes the quota (sets both cooldowns, bumps the
// window counter) so the caller never has to make a second round trip.
const LIMIT_SCRIPT = `
local cdTtl = redis.call('PTTL', KEYS[1])
if cdTtl > 0 then
  return { 1, cdTtl, tonumber(redis.call('GET', KEYS[2]) or '0') }
end

local pairSeconds = tonumber(ARGV[3])
if pairSeconds > 0 then
  local pairTtl = redis.call('PTTL', KEYS[3])
  if pairTtl > 0 then
    return { 2, pairTtl, tonumber(redis.call('GET', KEYS[2]) or '0') }
  end
end

local count = redis.call('INCR', KEYS[2])
if count == 1 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[2]))
else
  -- Repair a counter that somehow lost its TTL rather than letting it stick.
  if redis.call('TTL', KEYS[2]) < 0 then
    redis.call('EXPIRE', KEYS[2], tonumber(ARGV[2]))
  end
end

local cooldownSeconds = tonumber(ARGV[1])
if cooldownSeconds > 0 then
  redis.call('SET', KEYS[1], '1', 'EX', cooldownSeconds)
end
if pairSeconds > 0 then
  redis.call('SET', KEYS[3], '1', 'EX', pairSeconds)
end

return { 0, 0, count }
`

let _scriptDefined = false
function ensureScript() {
  if (_scriptDefined) return
  redis.defineCommand('czoneMailConsume', { numberOfKeys: 3, lua: LIMIT_SCRIPT })
  _scriptDefined = true
}

export class RateLimiterUnavailableError extends Error {
  constructor(message) {
    super(message || 'rate limiter unavailable')
    this.name = 'RateLimiterUnavailableError'
  }
}

/**
 * Atomically check the cooldowns and consume one unit of send quota.
 *
 * Throws RateLimiterUnavailableError if Redis is unreachable. The caller must
 * fail CLOSED on that: silently dropping rate limiting on a kids' messaging
 * feature is worse than a brief outage.
 *
 * @returns {{ allowed: boolean, reason: 'cooldown'|'pair_cooldown'|null,
 *             retryAfterSeconds: number, windowCount: number }}
 */
export async function consumeCzoneMailQuota({ senderId, recipientId, settings }) {
  ensureScript()

  let raw
  try {
    raw = await redis.czoneMailConsume(
      cooldownKey(senderId),
      windowKey(senderId),
      pairKey(senderId, recipientId),
      String(settings.cooldownSeconds),
      String(Math.max(1, settings.spamWindowMinutes * 60)),
      String(settings.pairCooldownMinutes * 60)
    )
  } catch (err) {
    throw new RateLimiterUnavailableError(err?.message)
  }

  const [blockedBy, retryAfterMs, windowCount] = raw.map(Number)

  if (blockedBy === 1) {
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      windowCount
    }
  }
  if (blockedBy === 2) {
    return {
      allowed: false,
      reason: 'pair_cooldown',
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      windowCount
    }
  }
  return { allowed: true, reason: null, retryAfterSeconds: 0, windowCount }
}

/**
 * Give back the quota consumed by a send that ultimately didn't happen (e.g. the
 * database write failed). Best-effort: a failure here only costs the sender one
 * cooldown period.
 */
export async function refundCzoneMailQuota({ senderId, recipientId }) {
  try {
    await redis.del(cooldownKey(senderId), pairKey(senderId, recipientId))
    await redis.decr(windowKey(senderId))
  } catch {
    // ignore
  }
}

/** Clear a sender's burst counter, used when an admin lifts a block early. */
export async function resetCzoneMailWindow(senderId) {
  try {
    await redis.del(windowKey(senderId), cooldownKey(senderId))
  } catch {
    // ignore
  }
}
