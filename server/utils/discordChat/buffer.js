// Redis-backed ring buffer of recent chat messages.
//
// See constants.js for the import rules.
//
// ── Why Redis and not process memory ─────────────────────────────────────────
// The buffer is written by the gateway worker and read by socket-server, which
// are separate processes, so it has to be shared state regardless. It would
// also be wrong in memory even in a single process: a restart takes 3-15
// seconds here, and every client that joins in that window would get an empty
// panel with no way to recover until someone happened to speak.
//
// Stored newest-first (LPUSH + LTRIM). Callers that render reverse it.

import { CHAT_KEYS, BUFFER_SIZE } from './constants.js'

/**
 * Inserts or replaces a message, keeping the list capped and de-duplicated.
 *
 * De-duplication is required, not defensive: RESUMEing a gateway session
 * replays events that were already delivered, so the same message id will
 * legitimately arrive twice.
 */
export async function bufferPut(redis, message) {
  if (!message?.id) return
  try {
    const existing = await redis.lrange(CHAT_KEYS.buffer, 0, BUFFER_SIZE - 1)
    const kept = existing.filter((raw) => {
      try {
        return JSON.parse(raw).id !== message.id
      } catch {
        return false
      }
    })
    kept.unshift(JSON.stringify(message))
    // Rewrite the whole list in one round trip. At 50 entries this is cheaper
    // and simpler than maintaining a parallel index, and it keeps insert
    // idempotent by construction.
    const pipeline = redis.multi()
    pipeline.del(CHAT_KEYS.buffer)
    if (kept.length) pipeline.rpush(CHAT_KEYS.buffer, ...kept.slice(0, BUFFER_SIZE))
    await pipeline.exec()
  } catch (err) {
    console.error('[DiscordChat] buffer put failed:', err?.message || err)
  }
}

/**
 * Merges a partial MESSAGE_UPDATE into an existing entry.
 *
 * MESSAGE_UPDATE payloads are PARTIAL in practice even though the docs read as
 * though they are complete: when Discord's embed service unfurls a link it
 * emits an update carrying essentially only id/channel_id/embeds, with no
 * author and no content. Replacing the stored entry with a normalized version
 * of that would blank the message.
 *
 * So this merges by KEY PRESENCE, and returns null when the id is unknown —
 * a partial must never be inserted as a new message.
 */
export async function bufferMerge(redis, id, patch) {
  if (!id) return null
  try {
    const existing = await redis.lrange(CHAT_KEYS.buffer, 0, BUFFER_SIZE - 1)
    let updated = null
    const next = existing.map((raw) => {
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return raw
      }
      if (parsed.id !== id) return raw
      // 'key' in patch, not `patch.key ?? existing.key`: clearing content while
      // keeping an attachment is a legitimate edit, and ?? would swallow it.
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

/** Removes ids from the buffer. Safe to call for ids that are not present. */
export async function bufferDelete(redis, ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map(String))
  if (!wanted.size) return
  try {
    const existing = await redis.lrange(CHAT_KEYS.buffer, 0, BUFFER_SIZE - 1)
    const kept = existing.filter((raw) => {
      try {
        return !wanted.has(String(JSON.parse(raw).id))
      } catch {
        return false
      }
    })
    const pipeline = redis.multi()
    pipeline.del(CHAT_KEYS.buffer)
    if (kept.length) pipeline.rpush(CHAT_KEYS.buffer, ...kept)
    await pipeline.exec()
  } catch (err) {
    console.error('[DiscordChat] buffer delete failed:', err?.message || err)
  }
}

/** Oldest-first snapshot, ready to render. */
export async function bufferSnapshot(redis) {
  try {
    const raw = await redis.lrange(CHAT_KEYS.buffer, 0, BUFFER_SIZE - 1)
    const parsed = []
    for (const entry of raw) {
      try {
        parsed.push(JSON.parse(entry))
      } catch {
        // skip corrupt entries rather than failing the whole join
      }
    }
    return parsed.reverse()
  } catch (err) {
    console.error('[DiscordChat] buffer read failed:', err?.message || err)
    return []
  }
}

/** Drops everything. Used by the kill switch and on a channel change. */
export async function bufferClear(redis) {
  try {
    await redis.del(CHAT_KEYS.buffer)
  } catch {
    // best effort
  }
}

/** Replaces the buffer wholesale from a REST re-seed. */
export async function bufferReplace(redis, messagesOldestFirst) {
  try {
    const entries = messagesOldestFirst
      .slice(-BUFFER_SIZE)
      .reverse()
      .map((m) => JSON.stringify(m))
    const pipeline = redis.multi()
    pipeline.del(CHAT_KEYS.buffer)
    if (entries.length) pipeline.rpush(CHAT_KEYS.buffer, ...entries)
    await pipeline.exec()
  } catch (err) {
    console.error('[DiscordChat] buffer replace failed:', err?.message || err)
  }
}
