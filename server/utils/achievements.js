// server/utils/achievements.js
import { prisma } from '../../server/prisma.js'
import { mintQueue } from '../../server/utils/queues.js'
import { announceAchievement } from '../../server/utils/discord.js'

function toIntOrNull(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function hasCumulativeActivityDays(db, userId, requiredDays) {
  const days = Math.floor(Number(requiredDays || 0))
  if (!Number.isFinite(days) || days <= 0) return true

  const count = await db.userDailyActivity.count({ where: { userId } })
  return count >= days
}

export async function evaluateUserAgainstAchievement(client, userId, ach) {
  const db = client || prisma
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true } })
  if (!user) {
    // console.log('[achievements] evaluate: user not found', { userId, ach: ach?.slug || ach?.id })
    return false
  }

  const achKey = ach?.slug || ach?.id
  // console.log('[achievements] evaluate: start', { userId, ach: achKey })

  // Points
  if (ach.pointsGte != null) {
    const up = await db.userPoints.findUnique({ where: { userId } })
    const pts = up?.points || 0
    if (pts < ach.pointsGte) {
      // console.log('[achievements] evaluate: fail points', { userId, ach: achKey, have: pts, need: ach.pointsGte })
      return false
    }
    // console.log('[achievements] evaluate: pass points', { userId, ach: achKey, have: pts, need: ach.pointsGte })
  }

  // Total cToons (exclude burned)
  if (ach.totalCtoonsGte != null) {
    const total = await db.userCtoon.count({ where: { userId, burnedAt: null } })
    if (total < ach.totalCtoonsGte) {
      // console.log('[achievements] evaluate: fail totalCtoons', { userId, ach: achKey, have: total, need: ach.totalCtoonsGte })
      return false
    }
    // console.log('[achievements] evaluate: pass totalCtoons', { userId, ach: achKey, have: total, need: ach.totalCtoonsGte })
  }

  // Unique cToons (exclude burned)
  if (ach.uniqueCtoonsGte != null) {
    const uniq = await db.userCtoon.findMany({
      where: { userId, burnedAt: null },
      distinct: ['ctoonId'],
      select: { ctoonId: true }
    })
    if (uniq.length < ach.uniqueCtoonsGte) {
      // console.log('[achievements] evaluate: fail uniqueCtoons', { userId, ach: achKey, have: uniq.length, need: ach.uniqueCtoonsGte })
      return false
    }
    // console.log('[achievements] evaluate: pass uniqueCtoons', { userId, ach: achKey, have: uniq.length, need: ach.uniqueCtoonsGte })
  }

  // Auctions won (closed with winner)
  if (ach.auctionsWonGte != null) {
    const won = await db.auction.count({
      where: { winnerId: userId, status: 'CLOSED' }
    })
    if (won < ach.auctionsWonGte) return false
  }

  // Auctions created (closed with winner)
  if (ach.auctionsCreatedGte != null) {
    const created = await db.auction.count({
      where: { creatorId: userId, status: 'CLOSED', winnerId: { not: null } }
    })
    if (created < ach.auctionsCreatedGte) return false
  }

  // Accepted trades (initiator or recipient)
  if (ach.tradesAcceptedGte != null) {
    const trades = await db.tradeOffer.count({
      where: {
        status: 'ACCEPTED',
        OR: [{ initiatorId: userId }, { recipientId: userId }]
      }
    })
    if (trades < ach.tradesAcceptedGte) return false
  }

  // Cumulative active days based on activity logs
  if (ach.cumulativeActiveDaysGte != null) {
    const ok = await hasCumulativeActivityDays(db, userId, ach.cumulativeActiveDaysGte)
    if (!ok) return false
  }

  // User created before a given date
  if (ach.userCreatedBefore) {
    const cutoff = new Date(ach.userCreatedBefore)
    const created = user.createdAt ? new Date(user.createdAt) : null
    if (!created || !(created < cutoff)) {
      // console.log('[achievements] evaluate: fail createdBefore', { userId, ach: achKey, userCreatedAt: created?.toISOString?.(), cutoff: cutoff.toISOString() })
      return false
    }
    // console.log('[achievements] evaluate: pass createdBefore', { userId, ach: achKey, userCreatedAt: created.toISOString(), cutoff: cutoff.toISOString() })
  }

  // Set completion (AND across all sets)
  const setsReq = Array.isArray(ach.setsRequired) ? ach.setsRequired.filter(Boolean) : []
  for (const setName of setsReq) {
    const setCtoons = await db.ctoon.findMany({ where: { set: setName }, select: { id: true } })
    const setIds = setCtoons.map(c => c.id)
    if (setIds.length === 0) {
      // console.log('[achievements] evaluate: fail set empty', { userId, ach: achKey, set: setName })
      return false
    }
    const ownedDistinct = await db.userCtoon.findMany({
      where: { userId, burnedAt: null, ctoonId: { in: setIds } },
      distinct: ['ctoonId'],
      select: { ctoonId: true }
    })
    if (ownedDistinct.length < setIds.length) {
      // console.log('[achievements] evaluate: fail set missing', { userId, ach: achKey, set: setName, have: ownedDistinct.length, need: setIds.length })
      return false
    }
    // console.log('[achievements] evaluate: pass set', { userId, ach: achKey, set: setName })
  }

  // console.log('[achievements] evaluate: success', { userId, ach: achKey })
  return true
}

async function getOrCreateUserPoints(tx, userId) {
  const up = await tx.userPoints.findUnique({ where: { userId } })
  if (up) return up
  return await tx.userPoints.create({ data: { userId, points: 0 } })
}

export async function awardAchievementToUser(client, userId, achievement) {
  const db = client || prisma

  const awardSummary = await db.$transaction(async (tx) => {
    // Create marker (will throw on duplicate due to unique)
    // console.log('[achievements] award: creating achievementUser', { userId, ach: achievement?.slug || achievement?.id })
    await tx.achievementUser.create({ data: { achievementId: achievement.id, userId } })

    // Rewards
    const reward = await tx.achievementReward.findFirst({
      where: { achievementId: achievement.id },
      include: {
        ctoons:      { select: { ctoonId: true, quantity: true, ctoon: { select: { quantity: true, name: true } } } },
        backgrounds: { select: { backgroundId: true } },
      }
    })

    if (!reward) {
      // console.log('[achievements] award: no reward row', { userId, ach: achievement?.slug || achievement?.id })
      return { points: 0, ctoons: [], backgrounds: 0 }
    }

    const awardSummary = { points: 0, ctoons: [], backgrounds: 0 }

    // Points
    const points = toIntOrNull(reward.points)
    if (points && points > 0) {
      const up = await getOrCreateUserPoints(tx, userId)
      const updated = await tx.userPoints.update({ where: { userId }, data: { points: { increment: points } } })
      await tx.pointsLog.create({
        data: { userId, points, total: updated.points, method: `achievement:${achievement.slug}`, direction: 'increase' }
      })
      awardSummary.points = points
      // console.log('[achievements] award: points granted', { userId, ach: achievement?.slug || achievement?.id, points, newTotal: updated.points })
    }

    // Backgrounds
    const bgIds = [...new Set((reward.backgrounds || []).map(b => b.backgroundId))]
    if (bgIds.length) {
      const existing = await tx.userBackground.findMany({
        where: { userId, backgroundId: { in: bgIds } },
        select: { backgroundId: true }
      })
      const existingSet = new Set(existing.map(b => b.backgroundId))
      const newBgIds = bgIds.filter(id => !existingSet.has(id))
      awardSummary.backgrounds = newBgIds.length
      if (newBgIds.length) {
        await tx.userBackground.createMany({
          data: newBgIds.map(backgroundId => ({ userId, backgroundId })),
          skipDuplicates: true
        })
      }
      // console.log('[achievements] award: backgrounds granted', { userId, ach: achievement?.slug || achievement?.id, count: newBgIds.length })
    }

    // cToons — enqueue mint jobs, respecting supply where possible
    for (const rc of (reward.ctoons || [])) {
      const qty = Math.max(1, Number(rc.quantity || 1))
      // Pre-check sold-out, skip if no supply
      const minted = await tx.userCtoon.count({ where: { ctoonId: rc.ctoonId } })
      const lim = rc?.ctoon?.quantity
      let canGive = lim == null ? qty : Math.max(0, Math.min(qty, lim - minted))
      for (let i = 0; i < canGive; i++) {
        await mintQueue.add('mintCtoon', { userId, ctoonId: rc.ctoonId, isSpecial: true })
      }
      if (canGive > 0) {
        awardSummary.ctoons.push({
          name: rc?.ctoon?.name || rc.ctoonId,
          quantity: canGive
        })
      }
      // console.log('[achievements] award: ctoon enqueued', { userId, ach: achievement?.slug || achievement?.id, ctoonId: rc.ctoonId, requested: qty, supply: lim, alreadyMinted: minted, enqueued: canGive })
    }

    return awardSummary
  })

  // Non-transactional side-effect: announce in Discord channel when enabled.
  // console.log('[achievements] notifiyDiscord', achievement?.notifyDiscord)
  if (achievement?.notifyDiscord) {
    try {
      await announceAchievement(db, userId, achievement.title, awardSummary)
    } catch {}
  }
}

export async function processAchievementsForUser(userId) {
  // Only process active + non-banned users
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, active: true, banned: true } })
  if (!user) {
    // console.log('[achievements] process: skip no user', { userId })
    return { awarded: 0 }
  }
  if (!user.active || user.banned) {
    // console.log('[achievements] process: skip inactive/banned', { userId, active: user.active, banned: user.banned })
    return { awarded: 0 }
  }

  const achievements = await prisma.achievement.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  let awarded = 0
  for (const ach of achievements) {
    // Skip if already achieved
    const has = await prisma.achievementUser.findUnique({ where: { achievementId_userId: { achievementId: ach.id, userId } } })
    if (has) {
      // console.log('[achievements] process: skip already has', { userId, ach: ach.slug })
      continue
    }

    const ok = await evaluateUserAgainstAchievement(prisma, userId, ach)
    if (!ok) {
      // console.log('[achievements] process: not eligible', { userId, ach: ach.slug })
      continue
    }

    try {
      await awardAchievementToUser(prisma, userId, ach)
      awarded++
    } catch (err) {
      // uniqueness or other issue — skip; continue others
      // console.log('[achievements] process: award failed', { userId, ach: ach.slug, error: err?.message })
    }
  }

  // console.log('[achievements] process: complete', { userId, awarded })
  return { awarded }
}
