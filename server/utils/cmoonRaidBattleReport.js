// server/utils/cmoonRaidBattleReport.js
// Pure, DB-free aggregation of a RESOLVED raid's CMoonEnemyRaid.roundLog into the "Click to view
// battle report" leaderboard shown on the raid end screen (pages/newsite/cmoon-raid/[id].vue).
// No Prisma/BullMQ imports here, on purpose — same unit-testable-without-a-DB discipline as
// cmoonEnemyBattle.js/cmoonEnemyRaid.js/cmoonRaidBalance.js.
//
// roundLog's per-round participant rows only started carrying playerDamage/enemyDamage once this
// feature shipped (see closeRound in cmoonRaidSocket.js) — every field this module reads off a
// round row is defensively coerced with `|| 0`/`?? null` so a raid that resolved (or was already
// in progress) before that change renders a report with zeroed-out damage columns instead of
// NaN/crashing.

// Display-only heuristic, no gameplay effect: rewards raw damage dealt (the main contribution to
// the kill) plus a flat bonus per special fired (a big, deliberate swing worth more than an
// ordinary hit) and a small bonus per block (good defense, kept modest since a block's own HP-heal
// already rewards it). Not meant to be "the" correct way to rank a raid — just a stable, sensible
// single number alongside the raw stat columns.
const SCORE_PER_SPECIAL = 15
const SCORE_PER_BLOCK = 3

function emptyPlayerStats(userId, username) {
  return {
    userId, username,
    damageDealt: 0, damageTaken: 0,
    hitsLanded: 0, hitsBlocked: 0, hitsTaken: 0,
    critsDealt: 0, critsTaken: 0,
    specialsUsed: 0,
  }
}

/**
 * @param {object} raid
 * @param {Array} raid.roundLog - CMoonEnemyRaid.roundLog as persisted (array of round rows)
 * @param {Array} raid.participants - [{ userId, username, hpRemaining, maxHp, knockedOut, isInitiator, rewardsGranted }]
 * @param {string} raid.enemyName
 * @param {number} raid.enemyMaxHp
 * @param {number} raid.enemyHpRemaining
 * @param {string} raid.outcome - 'WIN' | 'LOSS' | 'ABANDONED'
 */
export function buildRaidBattleReport(raid) {
  const roundLog = Array.isArray(raid.roundLog) ? raid.roundLog : []
  const participants = Array.isArray(raid.participants) ? raid.participants : []

  const statsByUser = new Map()
  const nameByUser = new Map()
  for (const p of participants) {
    nameByUser.set(p.userId, p.username || 'Unknown')
    statsByUser.set(p.userId, emptyPlayerStats(p.userId, p.username || 'Unknown'))
  }

  let bossDamageDealt = 0 // total damage the boss dealt to the party across the whole fight
  let bossDamageTaken = 0 // total damage the party dealt to the boss
  let bossHitsLanded = 0  // how many participant-rounds the boss's action actually connected on
  let bossCritsLanded = 0
  let bossMisses = 0
  let bossSpecialsUsed = 0
  let playerSpecialsUsed = 0

  for (const round of roundLog) {
    const roundParticipants = Array.isArray(round?.participants) ? round.participants : []
    for (const row of roundParticipants) {
      if (!row || !row.userId) continue
      // A participant who joined mid-fight (or whose stats row predates this feature) might not
      // have an entry yet if they weren't in raid.participants for some reason — create one on
      // the fly rather than silently dropping their numbers from the report.
      let stats = statsByUser.get(row.userId)
      if (!stats) {
        stats = emptyPlayerStats(row.userId, nameByUser.get(row.userId) || 'Unknown')
        statsByUser.set(row.userId, stats)
      }
      const playerDamage = Number(row.playerDamage) || 0
      const enemyDamage = Number(row.enemyDamage) || 0
      stats.damageTaken += playerDamage
      stats.damageDealt += enemyDamage
      if (row.enemyHit) { stats.hitsLanded += 1; if (row.enemyCrit) stats.critsDealt += 1 }
      if (row.playerHit) { stats.hitsTaken += 1; if (row.playerCrit) stats.critsTaken += 1 }
      if (row.playerBlocked) stats.hitsBlocked += 1

      bossDamageDealt += playerDamage
      bossDamageTaken += enemyDamage
      if (row.playerHit) { bossHitsLanded += 1; if (row.playerCrit) bossCritsLanded += 1 }
      if (row.enemyMissed) bossMisses += 1
    }

    const specials = Array.isArray(round?.specials) ? round.specials : []
    for (const s of specials) {
      if (!s) continue
      if (s.side === 'PLAYER') {
        playerSpecialsUsed += 1
        if (s.userId) {
          let stats = statsByUser.get(s.userId)
          if (!stats) {
            stats = emptyPlayerStats(s.userId, nameByUser.get(s.userId) || 'Unknown')
            statsByUser.set(s.userId, stats)
          }
          stats.specialsUsed += 1
        }
      } else if (s.side === 'ENEMY') {
        bossSpecialsUsed += 1
      }
    }
  }

  const leaderboard = Array.from(statsByUser.values()).map(stats => {
    const p = participants.find(pp => pp.userId === stats.userId) || null
    const score = stats.damageDealt
      + stats.specialsUsed * SCORE_PER_SPECIAL
      + stats.hitsBlocked * SCORE_PER_BLOCK
    return {
      ...stats,
      hpRemaining: p?.hpRemaining ?? null,
      maxHp: p?.maxHp ?? null,
      knockedOut: !!p?.knockedOut,
      isInitiator: !!p?.isInitiator,
      score,
    }
  }).sort((a, b) => b.score - a.score || b.damageDealt - a.damageDealt)

  return {
    outcome: raid.outcome || null,
    rounds: roundLog.length,
    leaderboard,
    boss: {
      name: raid.enemyName || 'Raid Boss',
      maxHp: Number(raid.enemyMaxHp) || 0,
      hpRemaining: Math.max(0, Number(raid.enemyHpRemaining) || 0),
      damageDealt: bossDamageDealt,
      damageTaken: bossDamageTaken,
      hitsLanded: bossHitsLanded,
      critsLanded: bossCritsLanded,
      misses: bossMisses,
      specialsUsed: bossSpecialsUsed,
    },
    playerSpecialsUsed,
  }
}
