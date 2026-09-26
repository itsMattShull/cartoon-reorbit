// server/utils/ogGtoonsRedisState.js
//
// Redis-backed crash/restart persistence for in-progress original gToons (2002) matches, kept
// separate from server/utils/redisState.js (which is Clash/monster-battle/trade-room specific)
// rather than extended in place, so this game's serialization shape can change without touching
// that file's existing key layout or TTLs. Mirrors its pattern exactly: setX/delX/scanX per
// state kind, keyed under its own prefix.
//
// Only LIVE MATCHES are persisted — the matchmaking queue and pending direct challenges are
// deliberately NOT mirrored to Redis. Both are short-lived (a few minutes at most, reaped by the
// sweep in ogGtoonsSocket.js) and a stale queue/challenge entry surviving a process restart with
// no socket attached to it would be far more confusing to a player than simply having to
// re-queue or re-send the challenge.
//
// Key prefix: oggtoonsmatch:{matchId}

import { getRedis } from './redis.js'

const MATCH_TTL = 7200 // 2 hours

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

// Sockets and timer handles cannot be serialized and are always reconstructed on restore.
function serializeMatch(match) {
  return {
    id: match.id,
    players: match.players,
    usernames: match.usernames,
    deckOrder: match.deckOrder,
    remainingIdx: match.remainingIdx,
    pending: match.pending, // this batch's committed-but-unrevealed picks, per side
    goalColor: match.goalColor,
    revealed: match.revealed, // roundLog itself is built once, at match completion, not carried live
    stake: match.stake,
    currentBatch: match.currentBatch,
    isChallenge: match.isChallenge,
    startedAt: match.startedAt,
    lastActivity: match.lastActivity
  }
}

export async function setOgGtoonMatch(matchId, match) {
  const redis = getRedis()
  await redis.setex(`oggtoonsmatch:${matchId}`, MATCH_TTL, JSON.stringify(serializeMatch(match)))
}

export async function delOgGtoonMatch(matchId) {
  const redis = getRedis()
  await redis.del(`oggtoonsmatch:${matchId}`)
}

export async function scanOgGtoonMatches() {
  const redis = getRedis()
  const keys = await scanKeys('oggtoonsmatch:*')
  const results = new Map()
  if (!keys.length) return results
  const values = await redis.mget(...keys)
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    try {
      const matchId = keys[i].slice('oggtoonsmatch:'.length)
      results.set(matchId, JSON.parse(values[i]))
    } catch { /* skip corrupt entries */ }
  }
  return results
}
