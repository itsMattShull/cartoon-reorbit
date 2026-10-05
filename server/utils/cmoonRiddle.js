// server/utils/cmoonRiddle.js
// DB-touching logic for the cMoon Riddle system (see prisma/schema.prisma's CMoonRiddle model
// comment) — both the WEEKLY team riddle (server/utils/cmoonRiddleRotation.js) and the
// BOSS_LORE raid-boss gate reuse this for the atomic "first solver wins" claim and lookups. Pure
// answer comparison lives in cmoonRiddleAnswer.js instead (see that file's own comment on why);
// re-exported here so callers that need both only need one import.

import { recomputeCMoonTeamScores } from './cmoon.js'
import { recomputeCMoonPointsForUsers } from '../cron/cmoon-points-aggregate.js'

export { normalizeRiddleAnswer, isCorrectRiddleAnswer } from './cmoonRiddleAnswer.js'

// Claims a riddle's "first solver" slot for `userId`, atomically — a single conditional UPDATE
// guards it, the same shape as this codebase's other "only one caller can win" sentinels (the
// SHARED_POOL currentHp decrement, CMoonEnemyRaidParticipant.activeUserId). Returns
// { claimed: true, pointsAwarded } if THIS call won the race, or { claimed: false } if the
// riddle was already solved — by anyone, including a concurrent call that beat this one to it —
// so the caller never needs its own separate pre-check; this IS the check.
//
// `cMoonId` must already be the caller's resolved, current cMoon (checked by the caller, e.g.
// the /riddle command handler, which already has it from resolving the Discord user) — this
// function trusts the value it's given rather than re-querying it.
export async function claimCMoonRiddleSolve(prisma, { riddleId, userId, cMoonId }) {
  const { count } = await prisma.cMoonRiddle.updateMany({
    where: { id: riddleId, solvedAt: null },
    data: { solvedAt: new Date(), solvedByUserId: userId, solvedByCMoonId: cMoonId },
  })
  if (count === 0) return { claimed: false }

  const config = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { cMoonRiddlePoints: true },
  })
  const pointsAwarded = Math.max(0, Number(config?.cMoonRiddlePoints) || 0)
  if (pointsAwarded > 0) {
    await prisma.cMoonScoreLog.create({
      data: { cMoonId, userId, category: 'RIDDLE_SOLVE', detail: riddleId, points: pointsAwarded, weekStart: new Date() },
    })
    // Live-visible immediately, same pattern as the raid-win path in cmoonRaidSocket.js —
    // otherwise this player's rank bar / the team leaderboard only reflects it after the next
    // scheduled scoring run.
    await recomputeCMoonTeamScores()
    await recomputeCMoonPointsForUsers([userId])
  }
  return { claimed: true, pointsAwarded }
}

// The currently-open WEEKLY riddle, if any — active, already posted (postedAt set), and not yet
// solved. At most one should ever match in practice (the rotation job only posts the next one
// once the current one is replaced/deactivated), but this takes the most-recently-posted if
// somehow more than one does.
export async function getOpenWeeklyRiddle(prisma) {
  return prisma.cMoonRiddle.findFirst({
    where: { kind: 'WEEKLY', active: true, postedAt: { not: null }, solvedAt: null },
    orderBy: { postedAt: 'desc' },
  })
}

// The riddle (if any) currently gating a BOSS_LORE raid boss — active and tied to this specific
// enemyMemberId. Unlike the weekly riddle this is looked up by boss, not "the one open riddle",
// since a different boss's own BOSS_LORE riddle must never gate on it being solved.
export async function getActiveBossLoreRiddle(prisma, enemyMemberId) {
  if (!enemyMemberId) return null
  return prisma.cMoonRiddle.findFirst({
    where: { kind: 'BOSS_LORE', active: true, enemyMemberId },
  })
}
