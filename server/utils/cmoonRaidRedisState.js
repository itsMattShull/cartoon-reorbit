// server/utils/cmoonRaidRedisState.js
//
// Redis-backed crash/restart persistence for in-progress cMoon Enemy Battles raids, kept separate
// from server/utils/redisState.js (Clash/monster-battle/trade-room specific) and
// server/utils/ogGtoonsRedisState.js (that game's own match shape) rather than extended into
// either — mirrors both exactly: setX/delX/scanX for one state kind, keyed under its own prefix,
// so this feature's serialization shape can change without touching either file's key layout.
//
// Every raid is persisted, including FORMING ones — unlike ogGtoons' matchmaking queue/challenges,
// a FORMING raid already has real consequences attached (a Discord announcement went out, players
// got a notification) that a process restart must not silently orphan.
//
// Key prefix: cmoonraid:{raidId}

import { getRedis } from './redis.js'

const RAID_TTL = 3600 // 1 hour — a raid resolves in minutes; this only covers restart survival

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

// Sockets and timer handles cannot be serialized and are always reconstructed on restore (the
// caller re-derives them from roundDeadlineAt/joinDeadlineAt). `participants` is stored as a
// plain array (Map isn't JSON-serializable) — the caller rebuilds the Map keyed by userId. Must
// mirror the FULL runtime raid shape documented at the top of cmoonRaidSocket.js — a field
// missing here (enemyStats in particular, previously stored under the wrong key `enemyMaxHp`,
// which doesn't exist on the raid object at all) silently reconstructs a broken raid that only
// fails once something actually reads it, e.g. resolveRaidRound crashing on
// `enemyMember.critChanceFromPercent` the next time a restored raid's round closes.
function serializeRaid(raid) {
  return {
    id: raid.id,
    enemyMemberId: raid.enemyMemberId,
    cMoonId: raid.cMoonId,
    cMoonName: raid.cMoonName,
    discordChannelId: raid.discordChannelId,
    discordThreadId: raid.discordThreadId,
    status: raid.status,
    enemyName: raid.enemyName,
    enemyImagePath: raid.enemyImagePath,
    enemySounds: raid.enemySounds,
    battleMusicPath: raid.battleMusicPath,
    enemyStats: raid.enemyStats,
    enemyHpRemaining: raid.enemyHpRemaining,
    roundNumber: raid.roundNumber,
    currentEnemyAction: raid.currentEnemyAction,
    roundDeadlineAt: raid.roundDeadlineAt,
    joinDeadlineAt: raid.joinDeadlineAt,
    participants: Array.from(raid.participants.values()),
    roundLog: raid.roundLog,
    startedAt: raid.startedAt,
    combatStartedAt: raid.combatStartedAt,
    endedAt: raid.endedAt,
    outcome: raid.outcome,
    // Special attacks — see the raid object's own shape comment in cmoonRaidSocket.js. A field
    // missing here silently drops it on restart, same trap that comment already warns about for
    // enemyStats — so these are listed explicitly rather than trusted to a future caller's memory.
    cMoonSpecialAttack: raid.cMoonSpecialAttack,
    enemySpecialAttack: raid.enemySpecialAttack,
    enemyHitStreak: raid.enemyHitStreak,
    partyAtkBonus: raid.partyAtkBonus,
    enemyAtkBonus: raid.enemyAtkBonus,
    enemyParalyzedTurns: raid.enemyParalyzedTurns,
    partyParalyzedTurns: raid.partyParalyzedTurns,
  }
}

export async function setCMoonRaid(raidId, raid) {
  const redis = getRedis()
  await redis.setex(`cmoonraid:${raidId}`, RAID_TTL, JSON.stringify(serializeRaid(raid)))
}

export async function delCMoonRaid(raidId) {
  const redis = getRedis()
  await redis.del(`cmoonraid:${raidId}`)
}

export async function scanCMoonRaids() {
  const redis = getRedis()
  const keys = await scanKeys('cmoonraid:*')
  const results = new Map()
  if (!keys.length) return results
  const values = await redis.mget(...keys)
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    try {
      const raidId = keys[i].slice('cmoonraid:'.length)
      results.set(raidId, JSON.parse(values[i]))
    } catch { /* skip corrupt entries */ }
  }
  return results
}
