// server/utils/cmoonRankRecalc.js
//
// Shared per-user rank-correction logic used by both the admin "Recalculate cMoon Points" tool
// (server/workers/cmoon-rank-recalc.worker.js) and the admin "HP Catch Up" tool
// (server/workers/cmoon-hp-catchup.worker.js) — factored out so the two share one definition of
// "what should this member's rank actually be" rather than drifting apart. Both tools ultimately
// exist to keep User.currentCMoonRankId correct, which is also the sole input to
// getPlayerCombatMaxHp() (server/utils/cmoon.js) — there's no separate "HP" value stored anywhere
// to go stale, so correcting the rank pointer IS the HP fix, for either tool.
import { prisma } from '../prisma.js'

// Same shape as the RECOMPUTE_SQL in server/cron/cmoon-points-aggregate.js, just scoped to one
// user at a time (processing members one at a time keeps a single job's progress reporting simple
// and keeps the work spread out rather than one giant set-based statement).
export async function recomputePointsForUser(userId, cMoonId, cMoonSelectedAt) {
  const [row] = await prisma.$queryRaw`
    SELECT COALESCE(SUM(points), 0)::int AS total
    FROM "CMoonScoreLog"
    WHERE "userId" = ${userId}
      AND "cMoonId" = ${cMoonId}
      AND "createdAt" >= ${cMoonSelectedAt}
  `
  return Number(row?.total || 0)
}

// Highest-sortOrder CMoonRank in this cMoon whose granting achievement's cMoonPointsGte is at or
// below `points` — mirrors exactly how ranks are actually granted (an Achievement's cMoonRankId +
// cMoonPointsGte; see evaluateUserAgainstAchievement/awardAchievementToUser in
// server/utils/achievements.js), so this reproduces the same ladder for both tier-provisioned
// ranks (server/utils/cmoonRankTiers.js) and any point-gated legacy hand-authored rank. Whatever
// this returns (including null, if nothing qualifies) IS the user's new rank — this redoes the
// rank straight from the recalculated total, it doesn't preserve the old one.
export async function bestRankForUser(cMoonId, newPoints) {
  return prisma.cMoonRank.findFirst({
    where: { cMoonId, achievements: { some: { cMoonPointsGte: { lte: newPoints } } } },
    orderBy: { sortOrder: 'desc' },
    select: { id: true, name: true, sortOrder: true },
  })
}

// Recomputes one user's cMoonPoints + currentCMoonRankId and persists the correction if anything
// changed. Returns null if nothing needed to change, otherwise a summary entry describing the
// correction (same shape both tools' progress feeds already use).
export async function recorrectUserRank(user) {
  const newPoints = await recomputePointsForUser(user.id, user.cMoonId, user.cMoonSelectedAt)
  const newRank = await bestRankForUser(user.cMoonId, newPoints)
  const newRankId = newRank?.id || null

  const pointsChanged = newPoints !== user.cMoonPoints
  const rankChanged = newRankId !== (user.currentCMoonRankId || null)

  if (!pointsChanged && !rankChanged) return null

  await prisma.user.update({
    where: { id: user.id },
    data: {
      cMoonPoints: newPoints,
      currentCMoonRankId: newRankId,
      // A rank/role-grant cursor only means something for the rank it was earned under — clear it
      // on any rank change so the nightly Discord sync re-evaluates cleanly, mirroring
      // grantCMoonRank's own reset in server/utils/achievements.js.
      ...(rankChanged ? { cMoonRankRoleGrantedAt: null } : {}),
    },
  })

  let kind = null
  if (rankChanged) {
    if (!newRankId) kind = 'cleared'
    else if (!user.currentCMoonRankId || newPoints >= user.cMoonPoints) kind = 'upgraded'
    else kind = 'downgraded'
  }

  return {
    username: user.username,
    cMoonName: user.cMoon?.name || null,
    oldPoints: user.cMoonPoints,
    newPoints,
    oldRank: user.currentCMoonRank?.name || null,
    newRank: newRank?.name || null,
    newRankSortOrder: newRank?.sortOrder ?? null,
    discordChannelId: user.cMoon?.discordChannelId || null,
    rankChanged,
    kind,
  }
}
