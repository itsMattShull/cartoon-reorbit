// server/utils/cmoonPvpBattleReport.js
// Pure, DB-free aggregation of a RESOLVED PvP match's CMoonPvpMatch.roundLog into the "Click to
// view battle report" leaderboard shown on the match end screen — the PvP sibling of
// cmoonRaidBattleReport.js. No boss column here (both sides are players), so this is simpler: one
// leaderboard, split by team, rather than a party-vs-boss pair of totals.

const SCORE_PER_SPECIAL = 15
const SCORE_PER_BLOCK = 3

function emptyPlayerStats(userId, username, team) {
  return {
    userId, username, team,
    damageDealt: 0, damageTaken: 0,
    hitsLanded: 0, hitsTaken: 0, hitsBlocked: 0,
    specialsUsed: 0,
  }
}

/**
 * @param {object} match
 * @param {Array} match.roundLog - CMoonPvpMatch.roundLog as persisted (array of round rows)
 * @param {Array} match.participants - [{ userId, username, team, hpRemaining, maxHp, knockedOut, isInitiator }]
 * @param {string} match.outcome - 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'ABANDONED'
 */
export function buildPvpBattleReport(match) {
  const roundLog = Array.isArray(match.roundLog) ? match.roundLog : []
  const participants = Array.isArray(match.participants) ? match.participants : []

  const statsByUser = new Map()
  for (const p of participants) statsByUser.set(p.userId, emptyPlayerStats(p.userId, p.username || 'Unknown', p.team))

  for (const round of roundLog) {
    const roundParticipants = Array.isArray(round?.participants) ? round.participants : []
    for (const row of roundParticipants) {
      if (!row || !row.userId) continue
      let stats = statsByUser.get(row.userId)
      if (!stats) {
        stats = emptyPlayerStats(row.userId, 'Unknown', row.team)
        statsByUser.set(row.userId, stats)
      }
      stats.damageDealt += Number(row.damageDealt) || 0
      stats.damageTaken += Number(row.damageTaken) || 0
      if (row.hit) stats.hitsLanded += 1
      if (row.damageTaken > 0) stats.hitsTaken += 1
      if (row.blocked) stats.hitsBlocked += 1
    }

    const specials = Array.isArray(round?.specials) ? round.specials : []
    for (const s of specials) {
      if (!s || !s.userId) continue
      let stats = statsByUser.get(s.userId)
      if (!stats) {
        stats = emptyPlayerStats(s.userId, s.username || 'Unknown', s.team)
        statsByUser.set(s.userId, stats)
      }
      stats.specialsUsed += 1
    }
  }

  const leaderboard = Array.from(statsByUser.values()).map(stats => {
    const p = participants.find(pp => pp.userId === stats.userId) || null
    const score = stats.damageDealt + stats.specialsUsed * SCORE_PER_SPECIAL + stats.hitsBlocked * SCORE_PER_BLOCK
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
    outcome: match.outcome || null,
    rounds: roundLog.length,
    leaderboard,
    teamA: leaderboard.filter(l => l.team === 'A'),
    teamB: leaderboard.filter(l => l.team === 'B'),
  }
}
