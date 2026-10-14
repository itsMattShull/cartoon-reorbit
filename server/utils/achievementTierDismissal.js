// server/utils/achievementTierDismissal.js
//
// Fixes a UX dead end: a universal CMoonRankTier reward can only ever be claimed once per
// player (see claimAchievementReward's cross-cMoon tier-claim guard in
// server/utils/achievements.js), but each cMoon gets its own copy of that tier's Achievement row
// (server/utils/cmoonRankTiers.js), and switching teams resets a player's cMoonPoints/rank from
// zero (see server/utils/cmoon.js) without touching their old AchievementUser/AchievementClaim
// rows. A player who ranks back up to a tier they already claimed through their OLD cMoon will
// re-unlock the NEW cMoon's copy (a fresh AchievementUser row) but can never actually claim its
// reward — every attempt 409s with TIER_ALREADY_CLAIMED. Before this file, server/api/cmoon/
// [id]/rank-progress.get.js had no way to know that, so its own cMoon page kept listing the dead
// copy as an ordinary claimable reward forever, with no way to clear it.
import { prisma } from '../prisma.js'

// Pure: annotates each `{ id, cMoonRankTierId }` candidate with `blockedElsewhere` (true if that
// same tier was already claimed through some OTHER achievement) and drops any the player has
// already dismissed. `claimedTierIds`/`dismissedAchievementIds` are plain arrays — see
// annotateUnclaimableTierClaims below for the live version that gathers them from the DB.
export function annotateAndFilterTierClaims(candidates, claimedTierIds, dismissedAchievementIds) {
  const claimedSet = new Set(claimedTierIds || [])
  const dismissedSet = new Set(dismissedAchievementIds || [])
  return (candidates || [])
    .filter((c) => !dismissedSet.has(c.id))
    .map((c) => ({ ...c, blockedElsewhere: claimedSet.has(c.cMoonRankTierId) }))
}

// Live version for rank-progress.get.js. `candidates` is `{ id, cMoonRankTierId }[]` — already
// scoped to achievements this user has unlocked but not claimed under their OWN id (see that
// endpoint's existing unclaimedRankRewards query, which is unaffected: this only adds the
// cross-achievement tier check on top). Two small extra queries, only ever run when there's at
// least one tier-rank candidate to check.
export async function annotateUnclaimableTierClaims(userId, candidates) {
  const tierIds = [...new Set((candidates || []).map((c) => c.cMoonRankTierId).filter(Boolean))]
  if (!tierIds.length) return candidates || []

  const [claimedElsewhere, dismissed] = await Promise.all([
    prisma.achievementClaim.findMany({
      where: { userId, achievement: { cMoonRankTierId: { in: tierIds } } },
      select: { achievement: { select: { cMoonRankTierId: true } } },
    }),
    prisma.achievementTierClaimDismissal.findMany({
      where: { userId, achievementId: { in: candidates.map((c) => c.id) } },
      select: { achievementId: true },
    }),
  ])

  return annotateAndFilterTierClaims(
    candidates,
    claimedElsewhere.map((r) => r.achievement.cMoonRankTierId),
    dismissed.map((d) => d.achievementId),
  )
}

// Validates and records a player's dismissal of ONE dead claim card. Only ever succeeds for an
// achievement that is genuinely unclaimable for this reason — never lets a player hide a
// legitimately claimable reward through this endpoint (dismissing is meant to clear a dead end,
// not to serve as an accidental "lose this reward" footgun). Idempotent: dismissing an
// already-dismissed card just upserts the same row again.
export async function dismissUnclaimableTierClaim(userId, achievementId) {
  const [achieved, ach] = await Promise.all([
    prisma.achievementUser.findUnique({ where: { achievementId_userId: { achievementId, userId } } }),
    prisma.achievement.findUnique({ where: { id: achievementId }, select: { cMoonRankTierId: true } }),
  ])
  if (!achieved) return { dismissed: false, reason: 'NOT_UNLOCKED' }
  if (!ach?.cMoonRankTierId) return { dismissed: false, reason: 'NOT_A_TIER_REWARD' }

  const claimedElsewhere = await prisma.achievementClaim.count({
    where: { userId, achievementId: { not: achievementId }, achievement: { cMoonRankTierId: ach.cMoonRankTierId } },
  })
  if (claimedElsewhere === 0) return { dismissed: false, reason: 'NOT_BLOCKED' }

  await prisma.achievementTierClaimDismissal.upsert({
    where: { achievementId_userId: { achievementId, userId } },
    create: { achievementId, userId },
    update: {},
  })
  return { dismissed: true }
}
