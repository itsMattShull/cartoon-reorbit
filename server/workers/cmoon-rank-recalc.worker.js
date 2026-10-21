// server/workers/cmoon-rank-recalc.worker.js
// Admin one-time correction tool: recalculates User.cMoonPoints for every current cMoon member
// using the current cMoonPoints logic (sum of the member's own CMoonScoreLog rows since
// cMoonSelectedAt — see server/cron/cmoon-points-aggregate.js), then re-derives their displayed
// cMoon rank from that corrected number. Triggered from Admin > cMoons ("Recalculate cMoon
// Points"), see server/api/admin/cmoons/recalculate-points.post.js.
//
// Deliberately does NOT filter candidates by "cMoonPoints > 1" (an earlier version of this tool
// did, and it was a real bug): the periodic aggregate cron above runs every 45 minutes for every
// member regardless of this tool, so by the time an admin clicks the button, the cron may have
// already silently corrected a member's cMoonPoints down to 0/1 on its own — while their
// currentCMoonRankId (which ONLY this tool, not the cron, ever lowers) is still whatever the old,
// inflated total earned them. Filtering candidates by current cMoonPoints would skip exactly the
// members most in need of a rank correction. Scanning every member is cheap (CMoonScoreLog is a
// handful of rows per user) and always safe to re-run.
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
import { announceCMoonRankUpFromRecalc } from '../utils/cmoonDiscordEvents.js'
import { recorrectUserRank } from '../utils/cmoonRankRecalc.js'

const QUEUE_KEY = process.env.CMOON_RANK_RECALC_QUEUE_KEY || 'cmoonRankRecalcQueue'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const RECENT_LIMIT = 25

const worker = new Worker(QUEUE_KEY, async (job) => {
  const { adminId } = job.data || {}

  const candidates = await prisma.user.findMany({
    where: { cMoonId: { not: null } },
    select: {
      id: true, username: true, cMoonId: true, cMoonSelectedAt: true,
      cMoonPoints: true, currentCMoonRankId: true,
      cMoon: { select: { name: true, discordChannelId: true } },
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
    const correction = await recorrectUserRank(user)
    if (correction) {
      changed++
      if (correction.rankChanged) {
        if (correction.kind === 'cleared') cleared++
        else if (correction.kind === 'upgraded') {
          // Never a downgrade/clear — filtered to this branch only, per this tool's own
          // upgraded/downgraded/cleared classification (see cmoonDiscordEvents.js's own comment on
          // why this is a separate hook from grantCMoonRank's gameplay path).
          upgraded++
          announceCMoonRankUpFromRecalc(correction.discordChannelId, correction.cMoonName, correction.username, correction.newRank, correction.newRankSortOrder).catch(() => {})
        } else {
          downgraded++
        }
      }
    }

    processed++
    const entry = {
      username: user.username,
      cMoonName: user.cMoon?.name || null,
      oldPoints: user.cMoonPoints,
      newPoints: correction ? correction.newPoints : user.cMoonPoints,
      oldRank: user.currentCMoonRank?.name || null,
      newRank: correction ? correction.newRank : (user.currentCMoonRank?.name || null),
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
