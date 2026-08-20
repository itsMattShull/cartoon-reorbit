// Discord REST calls for the chat relay. Uses global fetch (not Nitro's
// $fetch) since two callers are plain Node processes.
//
// Discord temporarily restricts an IP for too many invalid requests (401/403/
// 429 count), so retries here are bounded and 401/403/404 are never retried.

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
      if (attempt < attempts) { await sleep(500 * attempt); continue }
      throw new DiscordRestError(`network: ${err?.message || err}`, { terminal: false })
    }

    if (res.status === 429) {
      const scope = res.headers.get('x-ratelimit-scope') || 'user'
      let retryAfter = Number(res.headers.get('retry-after')) || 1
      try {
        const payload = await res.json()
        if (typeof payload?.retry_after === 'number') retryAfter = payload.retry_after
      } catch {}
      const retryAfterMs = Math.ceil(retryAfter * 1000)
      if (attempt < attempts && scope !== 'global') { await sleep(retryAfterMs); continue }
      throw new DiscordRestError(`rate limited (${scope})`, { status: 429, terminal: false, retryAfterMs })
    }

    if (res.status === 204) return null

    if (!res.ok) {
      let code = null
      let message = `HTTP ${res.status}`
      try {
        const payload = await res.json()
        code = payload?.code ?? null
        if (payload?.message) message = payload.message
      } catch {}
      const terminal = res.status === 401 || res.status === 403 || res.status === 404
      throw new DiscordRestError(message, { status: res.status, code, terminal })
    }

    try { return await res.json() } catch { return null }
  }
  throw new DiscordRestError('exhausted attempts', { terminal: false })
}

export function botAuth(rawToken) {
  if (!rawToken) return null
  return rawToken.startsWith('Bot ') ? rawToken : `Bot ${rawToken}`
}

// Backfill returns newest-first; callers render oldest-first. Missing
// READ_MESSAGE_HISTORY returns 200 + [], not a 403.
export async function fetchRecentMessages(channelId, rawToken, limit = 50) {
  const auth = botAuth(rawToken)
  if (!auth || !channelId) return []
  const list = await discordFetch(`/channels/${channelId}/messages?limit=${limit}`, { auth })
  return Array.isArray(list) ? list.reverse() : []
}

export async function fetchChannel(channelId, rawToken) {
  const auth = botAuth(rawToken)
  if (!auth || !channelId) return null
  return await discordFetch(`/channels/${channelId}`, { auth })
}

// ?wait=true is required: without it Discord returns 204 with no error even if
// the send fails, and we need the message id to dedupe against the gateway echo.
export async function executeWebhook({ id, token }, payload) {
  return await discordFetch(`/webhooks/${id}/${token}?wait=true`, { method: 'POST', body: payload, attempts: 2 })
}
