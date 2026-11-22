// Lightweight polling endpoint for the "Raid Den" MyOrbit room (MyOrbitRoom.isRaidDen) — shows
// whatever cMoon Enemy Battles raid is currently IN_PROGRESS, for spectating.
//
// Deliberately does NOT reach into server/utils/cmoonRaidSocket.js's in-memory `raids` Map (that
// module is only reachable from inside the single socket-server.js process's own module scope,
// and this is a plain stateless HTTP handler) — it reads the same Redis mirror that module
// already keeps current via fireSync() on every round (see cmoonRaidRedisState.js's own header
// comment: "every raid is persisted, including FORMING ones"). Postgres is NOT a viable source
// for this: CMoonEnemyRaid.status is only ever written as 'FORMING' (at creation) or 'RESOLVED'
// (at the end) — there is no per-round write while combat is in progress, so a Postgres query for
// status='IN_PROGRESS' would never match anything live.
import { defineEventHandler, createError } from 'h3'
import { scanCMoonRaidsCached } from '@/server/utils/cmoonRaidRedisState'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const raids = await scanCMoonRaidsCached()
  let active = null
  for (const raid of raids.values()) {
    if (raid.status !== 'IN_PROGRESS') continue
    if (!active || new Date(raid.combatStartedAt || raid.startedAt) > new Date(active.combatStartedAt || active.startedAt)) {
      active = raid
    }
  }
  if (!active) return { raid: null }

  const lastRound = Array.isArray(active.roundLog) && active.roundLog.length
    ? active.roundLog[active.roundLog.length - 1]
    : null

  return {
    raid: {
      id: active.id,
      enemyName: active.enemyName,
      enemyImagePath: active.enemyImagePath,
      maxHp: active.enemyStats?.maxHp ?? null,
      hpRemaining: active.enemyHpRemaining,
      roundNumber: active.roundNumber,
      participantCount: Array.isArray(active.participants) ? active.participants.length : 0,
      lastRoundSummary: lastRound
        ? `Round ${lastRound.round}: the party dealt ${lastRound.enemyDamageDealt} damage!`
        : null
    }
  }
})
