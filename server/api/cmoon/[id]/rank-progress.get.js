// server/api/cmoon/[id]/rank-progress.get.js
// The caller's OWN progress up the universal Rank Ladder for this specific cMoon (their rank is
// per-cMoon — see User.currentCMoonRankId — even though the ladder's name/threshold is shared
// across every cMoon, see CMoonRankTier). Mirrors affinity.get.js's shape/reasoning: per-caller,
// never cacheable, so it stays its own lightweight endpoint rather than folding into the shared,
// briefly-cached GET /api/cmoon/[id] payload. Never accepts a target userId — only ever returns
// the authenticated caller's own progress.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { isCMoonCaptain, displayRankName } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const cMoonId = event.context.params?.id
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const [tiers, me] = await Promise.all([
    db.cMoonRankTier.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, name: true, sortOrder: true, pointThreshold: true, maxRewardChoices: true,
        // Universal reward-cToon choices for this tier (same set for every cMoon — see
        // CMoonRankTierRewardCtoon's model comment) — each is a quantity-1 cToon reward the
        // player later picks exactly one of via the claim UI (see cmoonRankTiers.js's
        // resyncClaimOptions, which always grants { points: 0, quantity: 1 } for these).
        rewardCtoons: {
          orderBy: { sortOrder: 'asc' },
          select: { ctoon: { select: { id: true, name: true, assetPath: true } } },
        },
      },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { cMoonId: true, cMoonPoints: true, currentCMoonRank: { select: { id: true, name: true, sortOrder: true } } },
    }),
  ])

  const isMember = me?.cMoonId === cMoonId
  const cMoonPoints = isMember ? (me?.cMoonPoints || 0) : 0
  const nextTier = isMember ? (tiers.find(t => t.pointThreshold > cMoonPoints) || null) : null

  // Rank-up achievements the caller has already unlocked FOR THIS cMoon but never claimed a
  // reward for — surfaced here so a player who dismissed/missed the claim modal at the moment
  // they ranked up can still pick their reward from their own team's cMoon page, not only by
  // digging through the general Achievements list. Scoped to isMember: only ever shows a claim
  // slot for the cMoon the caller currently belongs to (an unclaimed reward from a cMoon they've
  // since left is still claimable, just from the Achievements page — see claimAchievementReward,
  // which never checks current membership). A big point jump can unlock more than one tier's
  // achievement at once (see server/utils/achievements.js), so this returns every pending one,
  // lowest tier first, not just the highest.
  const unclaimedRankRewards = isMember
    ? await db.achievement.findMany({
        where: {
          isClaimable: true,
          cMoonRankTierId: { not: null },
          cMoonRank: { cMoonId },
          users: { some: { userId } },
          claims: { none: { userId } },
        },
        orderBy: { cMoonRankTier: { sortOrder: 'asc' } },
        select: {
          id: true,
          title: true,
          cMoonRank: { select: { name: true } },
          claimOptions: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              label: true,
              reward: {
                select: {
                  points: true,
                  ctoons: { select: { quantity: true, ctoon: { select: { name: true, assetPath: true } } } },
                  backgrounds: { select: { background: { select: { label: true, imagePath: true } } } },
                },
              },
            },
          },
        },
      })
    : []

  // A captain always displays as "Captain" regardless of their actually-earned rank tier — see
  // displayRankName in server/utils/cmoon.js. sortOrder is left untouched (only the label
  // changes) since CMoonPage.vue's progress bar still needs the REAL rank's sortOrder to find
  // its floor threshold.
  let currentRank = isMember ? (me?.currentCMoonRank || null) : null
  if (isMember) {
    const isCaptain = await isCMoonCaptain(cMoonId, userId)
    if (isCaptain) {
      currentRank = { ...(currentRank || { id: null, sortOrder: -1 }), name: displayRankName(currentRank?.name, true) }
    }
  }

  return {
    isMember,
    cMoonPoints,
    currentRank,
    nextTier: nextTier ? { id: nextTier.id, name: nextTier.name, pointThreshold: nextTier.pointThreshold } : null,
    // Flattened for the client (a ladder-preview modal renders these directly, same reasoning as
    // affinity.get.js's `levels` — this is public/universal data, cheap to always include here
    // rather than behind a second request).
    tiers: tiers.map(t => ({
      id: t.id,
      name: t.name,
      sortOrder: t.sortOrder,
      pointThreshold: t.pointThreshold,
      maxRewardChoices: t.maxRewardChoices,
      rewardChoices: t.rewardCtoons.map(r => ({
        id: r.ctoon.id,
        name: r.ctoon.name,
        imagePath: r.ctoon.assetPath,
      })),
    })),
    // Same claimOptions shape GET /api/achievements already returns, so the claim UI can be
    // reused as-is — each option posts to the existing POST /api/achievements/:id/claim.
    unclaimedRankRewards: unclaimedRankRewards.map(a => ({
      achievementId: a.id,
      title: a.title,
      rankName: a.cMoonRank?.name || null,
      claimOptions: a.claimOptions.map(o => ({
        id: o.id,
        label: o.label,
        points: o.reward?.points || 0,
        ctoons: (o.reward?.ctoons || []).map(rc => ({
          name: rc.ctoon?.name || 'cToon',
          quantity: rc.quantity,
          imagePath: rc.ctoon?.assetPath || null,
        })),
        backgrounds: (o.reward?.backgrounds || []).map(rb => ({
          label: rb.background?.label || '',
          imagePath: rb.background?.imagePath || null,
        })),
      })),
    })),
  }
})
