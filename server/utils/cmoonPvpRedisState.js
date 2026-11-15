// server/utils/cmoonPvpRedisState.js
//
// Redis-backed crash/restart persistence for in-progress cMoon PvP matches — the PvP sibling of
// cmoonRaidRedisState.js. Same discipline: every field the runtime match object carries must be
// listed explicitly here, since a field missing from serializeMatch silently reconstructs a
// broken match after a restart (see that file's own header comment for the real historical bug
// class this guards against — this is the same trap, just for a different shape).
//
// Every match is persisted, including FORMING ones — a FORMING match already has a real
// CMoonPvpMatch row and CMoonPvpParticipant locks attached, which a process restart must not
// silently orphan.
//
// Key prefix: cmoonpvp:{matchId}

import { getRedis } from './redis.js'

const MATCH_TTL = 3600 // 1 hour — a match resolves in minutes; this only covers restart survival

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

// Sockets and timer handles are never serialized — the caller re-derives them from
// roundDeadlineAt/joinDeadlineAt on restore. `participants` is stored as a plain array (Map isn't
// JSON-serializable); the caller rebuilds the Map keyed by userId. speedVotes is a Set in-memory,
// stored as a plain array for the same reason.
function serializeMatch(match) {
  return {
    id: match.id,
    status: match.status,
    outcome: match.outcome,
    initiatorUsername: match.initiatorUsername,
    teamACMoonId: match.teamACMoonId,
    teamBCMoonId: match.teamBCMoonId,
    teammatesOnlyEnabled: match.teammatesOnlyEnabled,
    maxTeamSize: match.maxTeamSize,
    equalizeHpEnabled: match.equalizeHpEnabled,
    equalizeHpAmount: match.equalizeHpAmount,
    pointsPerWin: match.pointsPerWin,
    roundNumber: match.roundNumber,
    roundDeadlineAt: match.roundDeadlineAt,
    joinDeadlineAt: match.joinDeadlineAt,
    joinWindowMs: match.joinWindowMs,
    participants: Array.from(match.participants.values()),
    roundLog: match.roundLog,
    startedAt: match.startedAt,
    combatStartedAt: match.combatStartedAt,
    endedAt: match.endedAt,
    isPrivate: match.isPrivate,
    roundLimit: match.roundLimit,
    tournamentMatchId: match.tournamentMatchId,
    // Team-wide combat status — see cmoonPvp.js's own header comment for the full effect-type
    // mapping each of these drives. A field missing here would silently reset that team's active
    // buff/debuff/status to its "nothing's happened yet" default on every restart.
    teamAAtkBonus: match.teamAAtkBonus,
    teamBAtkBonus: match.teamBAtkBonus,
    teamAAtkRaiseAmount: match.teamAAtkRaiseAmount,
    teamAAtkRaiseTurnsRemaining: match.teamAAtkRaiseTurnsRemaining,
    teamBAtkRaiseAmount: match.teamBAtkRaiseAmount,
    teamBAtkRaiseTurnsRemaining: match.teamBAtkRaiseTurnsRemaining,
    teamAParalyzedTurns: match.teamAParalyzedTurns,
    teamBParalyzedTurns: match.teamBParalyzedTurns,
    leaderKeepOpen: match.leaderKeepOpen,
    keepOpenExtensionUsed: match.keepOpenExtensionUsed,
    originalInitiatorUserId: match.originalInitiatorUserId,
    speedVotes: Array.from(match.speedVotes || []),
    // The map resolved for this match at creation (see resolveMapForPvp in
    // server/utils/cmoonEnemyMap.js) — same missing-field trap as every other snapshot above;
    // without these, a restart would silently drop the match back to no map/no hazard effects
    // mid-fight.
    mapId: match.mapId,
    mapName: match.mapName,
    mapIsBaseMap: match.mapIsBaseMap,
    mapBackgroundAnimation: match.mapBackgroundAnimation,
    mapBackgroundColor: match.mapBackgroundColor,
    mapSpecialThresholdReduction: match.mapSpecialThresholdReduction,
    mapPoisonAmount: match.mapPoisonAmount,
    mapPoisonIntervalRounds: match.mapPoisonIntervalRounds,
    mapPoisonAffectsPlayers: match.mapPoisonAffectsPlayers,
    mapHealAmount: match.mapHealAmount,
    mapHealIntervalRounds: match.mapHealIntervalRounds,
    mapHealAffectsPlayers: match.mapHealAffectsPlayers,
    mapFogOfWarEnabled: match.mapFogOfWarEnabled,
  }
}

export async function setCMoonPvpMatch(matchId, match) {
  const redis = getRedis()
  await redis.setex(`cmoonpvp:${matchId}`, MATCH_TTL, JSON.stringify(serializeMatch(match)))
}

export async function delCMoonPvpMatch(matchId) {
  const redis = getRedis()
  await redis.del(`cmoonpvp:${matchId}`)
}

export async function scanCMoonPvpMatches() {
  const redis = getRedis()
  const keys = await scanKeys('cmoonpvp:*')
  const results = new Map()
  if (!keys.length) return results
  const values = await redis.mget(...keys)
  for (let i = 0; i < keys.length; i++) {
    if (!values[i]) continue
    try {
      const matchId = keys[i].slice('cmoonpvp:'.length)
      results.set(matchId, JSON.parse(values[i]))
    } catch { /* skip corrupt entries */ }
  }
  return results
}
