// server/utils/myOrbitPresence.js
//
// A thin, COUNT-ONLY Redis mirror of "who's in MyOrbit right now and which room" — deliberately
// NOT the same thing as myOrbitSocket.js's own in-memory `rooms`/`roomByUser` Maps, and NOT a
// crash-recovery mirror the way cmoonRaidRedisState.js is for raids (see that file's header for
// the shape this one borrows). MyOrbit's own header comment already explains why full room state
// is never mirrored to Redis: presence is cosmetic, so losing it on a restart is fine. This file
// exists for exactly one reason the in-memory Maps can't serve on their own: the Nitro/Nuxt REST
// process (server/api/myorbit/*.js) runs SEPARATELY from socket-server.js, so it has no way to
// see live presence at all without something crossing that process boundary. A tiny Redis
// key per online user is the cheapest bridge — written by myOrbitSocket.js on join/room-switch,
// deleted on leave/removeParticipant, with a safety-net TTL in case a process dies without
// cleaning up (a stale key just makes someone look online a little longer than they are, same
// "cosmetic" risk tolerance as everything else in this feature).
//
// Key prefix: myorbit:presence:{userId}
import { getRedis } from './redis.js'

const PRESENCE_TTL = 120 // seconds - refreshed on every join/getState; a dead process's keys expire on their own

async function scanKeys(pattern) {
  const redis = getRedis()
  const keys = []
  let cursor = '0'
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = next
    keys.push(...batch)
  } while (cursor !== '0')
  return keys
}

export async function setUserPresence(userId, { roomId, username }) {
  const redis = getRedis()
  await redis.setex(`myorbit:presence:${userId}`, PRESENCE_TTL, JSON.stringify({ roomId, username }))
}

export async function clearUserPresence(userId) {
  const redis = getRedis()
  await redis.del(`myorbit:presence:${userId}`)
}

/** `[{ userId, roomId, username }, ...]` for every currently-online MyOrbit player. */
export async function listOnlinePresence() {
  const redis = getRedis()
  const keys = await scanKeys('myorbit:presence:*')
  if (!keys.length) return []
  const values = await redis.mget(...keys)
  const out = []
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    try {
      const userId = keys[i].slice('myorbit:presence:'.length)
      const { roomId, username } = JSON.parse(values[i])
      out.push({ userId, roomId, username })
    } catch { /* skip corrupt entries */ }
  }
  return out
}

/** `Map<roomId, count>` — derived from listOnlinePresence(), for the room list's occupant badges. */
export async function roomOccupancyCounts() {
  const counts = new Map()
  for (const p of await listOnlinePresence()) {
    counts.set(p.roomId, (counts.get(p.roomId) || 0) + 1)
  }
  return counts
}
