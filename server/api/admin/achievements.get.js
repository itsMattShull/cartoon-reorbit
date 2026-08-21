// server/api/admin/achievements.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

function mapRewardBundle(reward) {
  return {
    points: reward?.points || 0,
    ctoons: (reward?.ctoons || []).map(rc => ({ ctoonId: rc.ctoonId, quantity: rc.quantity, name: rc.ctoon?.name || '' })),
    backgrounds: (reward?.backgrounds || []).map(rb => ({ backgroundId: rb.backgroundId, label: rb.background?.label || '', imagePath: rb.background?.imagePath || null })),
  }
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const rewardInclude = {
    ctoons: { include: { ctoon: { select: { id: true, name: true } } } },
    backgrounds: { include: { background: { select: { id: true, label: true, imagePath: true } } } }
  }

  const items = await db.achievement.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rewards: { include: rewardInclude },
      requiredCtoons: { include: { ctoon: { select: { id: true, name: true, assetPath: true } } } },
      claimOptions: { orderBy: { sortOrder: 'asc' }, include: { reward: { include: rewardInclude } } },
      cMoonRank: { select: { id: true, name: true, cMoonId: true } },
    }
  })

  return items.map(a => {
    // Claimable achievements' rewards belong to their claim options, not a bare
    // AchievementReward row — see server/utils/achievementRewardBundle.js callers.
    const ownReward = !a.isClaimable ? a.rewards?.[0] : null
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      description: a.description,
      imagePath: a.imagePath,
      isActive: a.isActive,
      notifyDiscord: a.notifyDiscord,
      pointsGte: a.pointsGte,
      totalCtoonsGte: a.totalCtoonsGte,
      uniqueCtoonsGte: a.uniqueCtoonsGte,
      auctionsWonGte: a.auctionsWonGte,
      auctionsCreatedGte: a.auctionsCreatedGte,
      tradesAcceptedGte: a.tradesAcceptedGte,
      ctoonSuggestionsAcceptedGte: a.ctoonSuggestionsAcceptedGte,
      cumulativeActiveDaysGte: a.cumulativeActiveDaysGte,
      tkoWinsGte: a.tkoWinsGte,
      wordleWinsGte: a.wordleWinsGte,
      wordleCurrentStreakGte: a.wordleCurrentStreakGte,
      flappyBestScoreGte: a.flappyBestScoreGte,
      cMoonPointsGte: a.cMoonPointsGte,
      cMoonRankId: a.cMoonRankId,
      cMoonId: a.cMoonRank?.cMoonId || null,
      setsRequired: a.setsRequired || [],
      ctoonsRequired: (a.requiredCtoons || []).map(rc => ({ ctoonId: rc.ctoonId, name: rc.ctoon?.name || '', assetPath: rc.ctoon?.assetPath || null })),
      userCreatedBefore: a.userCreatedBefore,
      discordRoleName: a.discordRoleName,
      isClaimable: a.isClaimable,
      claimOptions: (a.claimOptions || []).map(o => ({ id: o.id, label: o.label, sortOrder: o.sortOrder, ...mapRewardBundle(o.reward) })),
      rewards: mapRewardBundle(ownReward),
    }
  })
})
