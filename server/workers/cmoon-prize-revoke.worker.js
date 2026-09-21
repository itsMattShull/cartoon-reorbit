// server/workers/cmoon-prize-revoke.worker.js
// Admin one-time correction tool: for every current cMoon member, finds any cMoon-rank
// achievement they're credited with (AchievementUser) whose point threshold their CURRENT,
// already-corrected User.cMoonPoints no longer meets — i.e. a rank they only reached because of
// the old PointsLog-based cMoonPoints bug (see server/cron/cmoon-points-aggregate.js). For each
// one: claws back any still-owned reward cToon from an AchievementClaim to the official account,
// then deletes the AchievementClaim and AchievementUser rows so the member can legitimately
// re-earn (and re-claim) that rank once their points genuinely cross the threshold again.
//
// Assumes cMoonPoints/currentCMoonRankId are already correct — this tool only touches the
// achievement/claim/prize layer, never cMoonPoints or currentCMoonRankId directly (see the
// separate "Recalculate cMoon Points" tool, server/workers/cmoon-rank-recalc.worker.js, which
// should be run first).
//
// Processes members ONE AT A TIME in a single job, same shape as cmoon-rank-recalc.worker.js, so
// the admin's progress modal can show a steadily-advancing feed via job.updateProgress — see
// server/api/admin/cmoons/revoke-invalid-prizes-status.get.js.
//
// Only claws back a cToon the member STILL owns (matched via CtoonOwnerLog's
// method:'ACHIEVEMENT_CLAIM' trail, at/after the claim's own timestamp) — one already traded or
// auctioned away is left with its new owner, same convention every other seizure tool in this
// codebase follows (server/api/admin/cheating-tool-apply-stream.post.js,
// server/workers/dissolve.worker.js).
import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { logAdminChange, buildSeizureAuditPayload } from '../utils/adminChangeLog.js'

const QUEUE_KEY = process.env.CMOON_PRIZE_REVOKE_QUEUE_KEY || 'cmoonPrizeRevokeQueue'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

// Every cMoon-rank achievement tied to this member's CURRENT cMoon whose point threshold their
// current cMoonPoints no longer meets — mirrors the "what does the corrected number alone
// qualify for" comparison in cmoon-rank-recalc.worker.js's bestRankForUser, just inverted to find
// what it does NOT (any longer) qualify for. A null cMoonPointsGte (a rank granted for a reason
// other than points) never matches `gt`, so a non-point-based rank is never touched here.
async function invalidRankAchievementsForUser(user) {
  return prisma.achievement.findMany({
    where: {
      cMoonRankId: { not: null },
      cMoonRank: { cMoonId: user.cMoonId },
      cMoonPointsGte: { gt: user.cMoonPoints },
    },
    select: {
      id: true,
      title: true,
      cMoonRank: { select: { name: true } },
    },
  })
}

// Clock-skew buffer for matching a claim's mint jobs to their resulting CtoonOwnerLog rows —
// minting is async (queued, not part of the claim transaction) but happens moments later.
const CLAIM_MATCH_BUFFER_MS = 5000

const worker = new Worker(QUEUE_KEY, async (job) => {
  const { adminId } = job.data || {}

  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const official = await prisma.user.findUnique({ where: { username: officialUsername }, select: { id: true } })
  if (!official) throw new Error(`Official account not found: ${officialUsername}`)

  const candidates = await prisma.user.findMany({
    where: { cMoonId: { not: null } },
    select: { id: true, username: true, cMoonId: true, cMoonPoints: true },
    orderBy: { id: 'asc' },
  })

  const total = candidates.length
  let processed = 0
  let usersAffected = 0
  let achievementsRevoked = 0
  let ctoonsClawedBack = 0
  const recent = []

  await job.updateProgress({ pct: 0, processed, total, recent })

  for (const user of candidates) {
    const invalid = await invalidRankAchievementsForUser(user)
    let userCtoonCount = 0
    const revokedRankNames = []
    const seizedCtoons = []

    for (const ach of invalid) {
      const achievedRow = await prisma.achievementUser.findUnique({
        where: { achievementId_userId: { achievementId: ach.id, userId: user.id } },
        select: { id: true },
      })
      if (!achievedRow) continue // never actually earned it, or already cleaned up by a prior run

      const claim = await prisma.achievementClaim.findUnique({
        where: { achievementId_userId: { achievementId: ach.id, userId: user.id } },
        select: {
          id: true,
          claimedAt: true,
          option: {
            select: {
              reward: {
                select: { ctoons: { select: { ctoonId: true, quantity: true, ctoon: { select: { name: true } } } } },
              },
            },
          },
        },
      })

      if (claim) {
        for (const rc of claim.option.reward.ctoons) {
          const owned = await prisma.userCtoon.findMany({
            where: {
              userId: user.id,
              ctoonId: rc.ctoonId,
              burnedAt: null,
              ownerLogs: {
                some: {
                  method: 'ACHIEVEMENT_CLAIM',
                  createdAt: { gte: new Date(claim.claimedAt.getTime() - CLAIM_MATCH_BUFFER_MS) },
                },
              },
            },
            select: { id: true, mintNumber: true },
            take: Math.max(1, Number(rc.quantity || 1)),
          })

          for (const uc of owned) {
            await prisma.$transaction(async (tx) => {
              await tx.userCtoon.update({ where: { id: uc.id }, data: { userId: official.id, isTradeable: false } })
              await tx.userTradeListItem.deleteMany({ where: { userCtoonId: uc.id, userId: { not: official.id } } })
              await tx.ctoonOwnerLog.create({
                data: {
                  userId: official.id,
                  ctoonId: rc.ctoonId,
                  userCtoonId: uc.id,
                  mintNumber: uc.mintNumber ?? null,
                  method: 'CMOON_RANK_REVOKE',
                },
              })
            })
            userCtoonCount++
            ctoonsClawedBack++
            seizedCtoons.push({ name: rc.ctoon?.name || 'cToon', mintNumber: uc.mintNumber ?? null, takenFromUsername: user.username })
          }
        }
        await prisma.achievementClaim.delete({ where: { id: claim.id } })
      }

      await prisma.achievementUser.delete({ where: { id: achievedRow.id } })
      achievementsRevoked++
      revokedRankNames.push(ach.cMoonRank?.name || ach.title)
    }

    if (revokedRankNames.length) {
      usersAffected++
      await logAdminChange(prisma, {
        userId: adminId,
        targetUserId: user.id,
        targetUsername: user.username,
        area: 'Admin:CMoons',
        key: 'revokeInvalidRankPrizes',
        prevValue: { ranks: revokedRankNames },
        newValue: buildSeizureAuditPayload({
          action: 'cmoonRankPrizeRevoke',
          target: user.username,
          pointsRecipient: officialUsername,
          ctoons: seizedCtoons,
        }),
      })
    }

    processed++
    const entry = { username: user.username, revokedRanks: revokedRankNames, ctoonsRevoked: userCtoonCount }
    if (revokedRankNames.length) {
      recent.push(entry)
      if (recent.length > 25) recent.shift()
    }

    await job.updateProgress({
      pct: total ? Math.round((processed / total) * 100) : 100,
      processed, total, recent, current: entry,
    })
  }

  return { total, processed, usersAffected, achievementsRevoked, ctoonsClawedBack }
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`[cmoon-prize-revoke worker] Job ${job?.id} failed:`, err)
})

export default worker
