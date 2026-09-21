// server/workers/cmoon-rank-recalc.worker.js
// Admin one-time correction tool: recalculates User.cMoonPoints for every member who has more
// than 1 (almost certainly stale, PointsLog-era) point, using the current cMoonPoints logic
// (sum of the member's own CMoonScoreLog rows since cMoonSelectedAt — see
// server/cron/cmoon-points-aggregate.js), then re-derives their displayed cMoon rank from that
// corrected number. Triggered from Admin > cMoons ("Recalculate cMoon Points"), see
// server/api/admin/cmoons/recalculate-points.post.js.
//
// Deliberately processes members ONE AT A TIME in a single job (not N parallel jobs) so the
// admin's progress modal can show a simple, steadily-advancing "member X of Y" feed via
// job.updateProgress — see server/api/admin/cmoons/recalculate-points-status.get.js.
//
// Unlike the periodic aggregate cron (which only ever adds/keeps cMoonPoints in sync going
// forward), this can lower a member's rank: the whole point of running this once is to correct
// numbers inflated under the old PointsLog-based logic. It never touches AchievementUser rows or
// already-claimed rewards — those are permanent grants (see the "never silently orphan a grant"
// convention documented on CMoonRankTier/CMoonPrizeCtoon) — it only updates the *current standing*
// fields (User.cMoonPoints, currentCMoonRankId).
import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { logAdminChange } from '../utils/adminChangeLog.js'

const QUEUE_KEY = process.env.CMOON_RANK_RECALC_QUEUE_KEY || 'cmoonRankRecalcQueue'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

// Same shape as the RECOMPUTE_SQL in server/cron/cmoon-points-aggregate.js, just scoped to one
// user at a time (see this file's header comment for why).
async function recomputePointsForUser(userId, cMoonId, cMoonSelectedAt) {
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
// this returns (including null, if nothing qualifies) IS the user's new rank — this tool redoes
// the rank straight from the recalculated total, it doesn't preserve the old one.
async function bestRankForUser(user, newPoints) {
  return prisma.cMoonRank.findFirst({
    where: { cMoonId: user.cMoonId, achievements: { some: { cMoonPointsGte: { lte: newPoints } } } },
    orderBy: { sortOrder: 'desc' },
    select: { id: true, name: true, sortOrder: true },
  })
}

const RECENT_LIMIT = 25

const worker = new Worker(QUEUE_KEY, async (job) => {
  const { adminId } = job.data || {}

  const candidates = await prisma.user.findMany({
    where: { cMoonId: { not: null }, cMoonPoints: { gt: 1 } },
    select: {
      id: true, username: true, cMoonId: true, cMoonSelectedAt: true,
      cMoonPoints: true, currentCMoonRankId: true,
      cMoon: { select: { name: true } },
      currentCMoonRank: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  })

  const total = candidates.length
  let processed = 0
  let changed = 0
  let upgraded = 0
  let downgraded = 0
  let cleared = 0
  const recent = []

  await job.updateProgress({ pct: 0, processed, total, recent })

  for (const user of candidates) {
    const newPoints = await recomputePointsForUser(user.id, user.cMoonId, user.cMoonSelectedAt)
    const newRank = await bestRankForUser(user, newPoints)
    const newRankId = newRank?.id || null

    const pointsChanged = newPoints !== user.cMoonPoints
    const rankChanged = newRankId !== (user.currentCMoonRankId || null)

    if (pointsChanged || rankChanged) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          cMoonPoints: newPoints,
          currentCMoonRankId: newRankId,
          // A rank/role-grant cursor only means something for the rank it was earned under —
          // clear it on any rank change so the nightly Discord sync re-evaluates cleanly,
          // mirroring grantCMoonRank's own reset in server/utils/achievements.js.
          ...(rankChanged ? { cMoonRankRoleGrantedAt: null } : {}),
        },
      })
      changed++
      if (rankChanged) {
        if (!newRankId) cleared++
        else if (!user.currentCMoonRankId || newPoints >= user.cMoonPoints) upgraded++
        else downgraded++
      }
    }

    processed++
    const entry = {
      username: user.username,
      cMoonName: user.cMoon?.name || null,
      oldPoints: user.cMoonPoints,
      newPoints,
      oldRank: user.currentCMoonRank?.name || null,
      newRank: newRank?.name || null,
    }
    recent.push(entry)
    if (recent.length > RECENT_LIMIT) recent.shift()

    await job.updateProgress({
      pct: total ? Math.round((processed / total) * 100) : 100,
      processed, total, recent, current: entry,
    })
  }

  const summary = { total, processed, changed, upgraded, downgraded, cleared }

  await logAdminChange(prisma, {
    userId: adminId,
    area: 'Admin:CMoons',
    key: 'recalculateRankPoints',
    prevValue: { candidateCount: total },
    newValue: summary,
  })

  return summary
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`[cmoon-rank-recalc worker] Job ${job?.id} failed:`, err)
})

export default worker
