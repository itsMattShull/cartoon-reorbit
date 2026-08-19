// Discord REST calls for the chat relay.
//
// See constants.js for the import rules. Uses globalThis.fetch, not Nitro's
// $fetch, because two of the three callers are plain Node processes.
//
// ── Why this is careful about failures ───────────────────────────────────────
// Discord temporarily restricts an IP that makes too many *invalid* requests —
// 10,000 per 10 minutes, where 401/403/429 all count. Those restrictions apply
// to the whole production IP, which on this host also serves OAuth login, DMs,
// the guild-sync cron and every announcement path. So a retry loop in the chat
// relay can take down Discord login for the entire site. Nothing here retries
// more than twice, 429s are always honoured rather than hammered through, and a
// 404 on a webhook is treated as terminal (Discord's docs single that case out:
// repeatedly using a 404ing webhook is itself grounds for a restriction).

const DISCORD_API = 'https://discord.com/api/v10'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class DiscordRestError extends Error {
  constructor(message, { status = 0, code = null, terminal = false, retryAfterMs = 0 } = {}) {
    super(message)
    this.name = 'DiscordRestError'
    this.status = status
    this.code = code
    this.terminal = terminal
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * One request, with bounded 429 handling.
 *
 * `attempts` counts total tries, not retries. Two is the ceiling everywhere:
 * one honoured 429 backoff is worth waiting for, a second means something is
 * structurally wrong and hammering it is how the IP restriction above happens.
 */
export async function discordFetch(path, { method = 'GET', body, auth, attempts = 2, timeoutMs = 8000 } = {}) {
  const url = path.startsWith('http') ? path : `${DISCORD_API}${path}`

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res
    try {
      res = await fetch(url, {
        method,
        headers: {
          ...(auth ? { Authorization: auth } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (err) {
      // Network error or timeout. Retry once; a second failure is reported so
      // the caller can degrade rather than spin.
      if (attempt < attempts) {
        await sleep(500 * attempt)
        continue
      }
      throw new DiscordRestError(`network: ${err?.message || err}`, { terminal: false })
    }

    if (res.status === 429) {
      // Three distinct cases, distinguished by scope. A `global` 429 means every
      // request from this process must pause, not just this route — which
      // matters because the same host runs the guild cron and the announcement
      // paths.
      const scope = res.headers.get('x-ratelimit-scope') || 'user'
      let retryAfter = Number(res.headers.get('retry-after')) || 1
      try {
        const payload = await res.json()
        if (typeof payload?.retry_after === 'number') retryAfter = payload.retry_after
      } catch {
        // header value stands
      }
      const retryAfterMs = Math.ceil(retryAfter * 1000)

      if (attempt < attempts && scope !== 'global') {
        await sleep(retryAfterMs)
        continue
      }
      throw new DiscordRestError(`rate limited (${scope})`, {
        status: 429,
        terminal: false,
        retryAfterMs
      })
    }

    if (res.status === 204) return null

    if (!res.ok) {
      let code = null
      let message = `HTTP ${res.status}`
      try {
        const payload = await res.json()
        code = payload?.code ?? null
        if (payload?.message) message = payload.message
      } catch {
        // non-JSON error body
      }
      // 401/403/404 are not transient. Retrying them is precisely what feeds the
      // invalid-request counter that gets the IP restricted.
      const terminal = res.status === 401 || res.status === 403 || res.status === 404
      throw new DiscordRestError(message, { status: res.status, code, terminal })
    }

    try {
      return await res.json()
    } catch {
      return null
    }
  }
  throw new DiscordRestError('exhausted attempts', { terminal: false })
}

/** Bot-authenticated call. Re-prefixes defensively, like the rest of the repo. */
export function botAuth(rawToken) {
  if (!rawToken) return null
  return rawToken.startsWith('Bot ') ? rawToken : `Bot ${rawToken}`
}

/**
 * Recent messages for the backfill seed.
 *
 * Two things bite here:
 *   • The API returns NEWEST FIRST. Callers render oldest-first, so this
 *     reverses before returning — getting it wrong renders history upside down
 *     in a bottom-anchored scrollback.
 *   • Missing READ_MESSAGE_HISTORY returns 200 with an EMPTY ARRAY, not a 403.
 *     So "no messages" is indistinguishable from "misconfigured" at this layer;
 *     the admin connection test reports on it explicitly instead.
 */
export async function fetchRecentMessages(channelId, rawToken, limit = 50) {
  const auth = botAuth(rawToken)
  if (!auth || !channelId) return []
  const list = await discordFetch(`/channels/${channelId}/messages?limit=${limit}`, { auth })
  if (!Array.isArray(list)) return []
  return list.reverse()
}

/** Channel metadata, used by the admin save handler to validate a channel id. */
export async function fetchChannel(channelId, rawToken) {
  const auth = botAuth(rawToken)
  if (!auth || !channelId) return null
  return await discordFetch(`/channels/${channelId}`, { auth })
}

/**
 * Posts one relayed message through the configured webhook.
 *
 * `?wait=true` is not optional. Without it Discord answers 204 and — per its
 * own docs — "a message that is not saved does not return an error", so sends
 * would fail silently. It also returns the created message id, which is the
 * only sound way to reconcile the sender's optimistic bubble against the echo
 * that arrives over the gateway (matching on content would collide whenever two
 * people send the same text in the same second).
 *
 * No Authorization header: the token in the path *is* the credential. Adding one
 * changes the rate-limit identity and buys nothing.
 */
export async function executeWebhook({ id, token }, payload) {
  return await discordFetch(`/webhooks/${id}/${token}?wait=true`, {
    method: 'POST',
    body: payload,
    attempts: 2
  })
}
