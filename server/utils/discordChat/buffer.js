// Redis-backed ring buffer of recent chat messages, newest-first. Shared
// between the gateway worker (writer) and socket-server (reader), and
// survives a restart — the alternative (in-memory) leaves every client with
// an empty panel after every deploy.

import { CHAT_KEYS, BUFFER_SIZE } from './constants.js'

// De-dup is required, not defensive: RESUMEing a gateway session replays
// events already delivered.
export async function bufferPut(redis, message) {
  if (!message?.id) return
  try {
    const existing = await redis.lrange(CHAT_KEYS.buffer, 0, BUFFER_SIZE - 1)
    const kept = existing.filter((raw) => {
      try { return JSON.parse(raw).id !== message.id } catch { return false }
    })
    kept.unshift(JSON.stringify(message))
    const pipeline = redis.multi()
    pipeline.del(CHAT_KEYS.buffer)
    if (kept.length) pipeline.rpush(CHAT_KEYS.buffer, ...kept.slice(0, BUFFER_SIZE))
    await pipeline.exec()
  } catch (err) {
    console.error('[DiscordChat] buffer put failed:', err?.message || err)
  }
}

// MESSAGE_UPDATE payloads are often partial (an embed unfurl carries no
// author/content), so this merges by KEY PRESENCE and never inserts a
// partial as a new message.
export async function bufferMerge(redis, id, patch) {
  if (!id) return null
  try {
    const existing = await redis.lrange(CHAT_KEYS.buffer, 0, BUFFER_SIZE - 1)
    let updated = null
    const next = existing.map((raw) => {
      let parsed
      try { parsed = JSON.parse(raw) } catch { return raw }
      if (parsed.id !== id) return raw
      for (const key of ['tokens', 'attachments', 'editedAt']) {
        if (key in patch) parsed[key] = patch[key]
      }
      updated = parsed
      return JSON.stringify(parsed)
    })
    if (!updated) return null
    const pipeline = redis.multi()
    pipeline.del(CHAT_KEYS.buffer)
    if (next.length) pipeline.rpush(CHAT_KEYS.buffer, ...next)
    await pipeline.exec()
    return updated
  } catch (err) {
    console.error('[DiscordChat] buffer merge failed:', err?.message || err)
    return null
  }
}

export async function bufferDelete(redis, ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map(String))
  if (!wanted.size) return
  try {
    const existing = await redis.lrange(CHAT_KEYS.buffer, 0, BUFFER_SIZE - 1)
    const kept = existing.filter((raw) => {
      try { return !wanted.has(String(JSON.parse(raw).id)) } catch { return false }
    })
    const pipeline = redis.multi()
    pipeline.del(CHAT_KEYS.buffer)
    if (kept.length) pipeline.rpush(CHAT_KEYS.buffer, ...kept)
    await pipeline.exec()
  } catch (err) {
    console.error('[DiscordChat] buffer delete failed:', err?.message || err)
  }
}

export async function bufferSnapshot(redis) {
  try {
    const raw = await redis.lrange(CHAT_KEYS.buffer, 0, BUFFER_SIZE - 1)
    const parsed = []
    for (const entry of raw) {
      try { parsed.push(JSON.parse(entry)) } catch {}
    }
    return parsed.reverse()
  } catch (err) {
    console.error('[DiscordChat] buffer read failed:', err?.message || err)
    return []
  }
}

export async function bufferClear(redis) {
  try { await redis.del(CHAT_KEYS.buffer) } catch {}
}

export async function bufferReplace(redis, messagesOldestFirst) {
  try {
    const entries = messagesOldestFirst.slice(-BUFFER_SIZE).reverse().map((m) => JSON.stringify(m))
    const pipeline = redis.multi()
    pipeline.del(CHAT_KEYS.buffer)
    if (entries.length) pipeline.rpush(CHAT_KEYS.buffer, ...entries)
    await pipeline.exec()
  } catch (err) {
    console.error('[DiscordChat] buffer replace failed:', err?.message || err)
  }
}
