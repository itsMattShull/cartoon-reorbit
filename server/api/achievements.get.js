// server/api/achievements.get.js
import { defineEventHandler, getRequestHeader } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me = null
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  const userId = me?.id || null

  // Load all active achievements
  const list = await db.achievement.findMany({
    where: { isActive: true },
    orderBy: { title: 'asc' },
    include: {
      rewards: {
        include: {
          ctoons: { include: { ctoon: { select: { id: true, name: true, assetPath: true } } } },
          backgrounds: { include: { background: { select: { id: true, label: true, imagePath: true } } } }
        }
      },
      claimOptions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          reward: {
            include: {
              ctoons: { include: { ctoon: { select: { id: true, name: true, assetPath: true } } } },
              backgrounds: { include: { background: { select: { id: true, label: true, imagePath: true } } } }
            }
          }
        }
      }
    }
  })

  const ids = list.map(a => a.id)
  const achievedSet = new Set()
  const claimedMap = new Map()
  if (userId) {
    const rows = await db.achievementUser.findMany({ where: { userId, achievementId: { in: ids } }, select: { achievementId: true } })
    rows.forEach(r => achievedSet.add(r.achievementId))
    const claims = await db.achievementClaim.findMany({ where: { userId, achievementId: { in: ids } }, select: { achievementId: true, optionId: true } })
    claims.forEach(c => claimedMap.set(c.achievementId, c.optionId))
  }

  // Counts excluding inactive/banned users
  const allAchievers = await db.achievementUser.findMany({
    where: { achievementId: { in: ids }, user: { active: true, banned: false } },
    select: { achievementId: true }
  })
  const countMap = new Map()
  for (const r of allAchievers) {
    countMap.set(r.achievementId, (countMap.get(r.achievementId) || 0) + 1)
  }

  return list.map(a => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    description: a.description,
    imagePath: a.imagePath,
    achievers: countMap.get(a.id) || 0,
    achieved: userId ? achievedSet.has(a.id) : false,
    isClaimable: a.isClaimable,
    // Flags a claim as "you were promoted to a cMoon rank" so the client can show the
    // rank-reveal modal (which names the rank) instead of the generic inline claim text.
    // The boolean alone is safe to expose to every caller of this list, including logged-out
    // (see the `me = null` fallback above) — it's derived from a field already implied by every
    // claim option's cToon/background rewards this same response already returns unfiltered.
    isCMoonRank: !!a.cMoonRankTierId,
    claimedOptionId: userId ? (claimedMap.get(a.id) || null) : null,
    // Each claim option is its own reward bundle now (points + multiple cToons +
    // backgrounds), not a single ctoon-or-points choice.
    claimOptions: a.isClaimable
      ? a.claimOptions.map(o => ({
          id: o.id,
          label: o.label,
          points: o.reward?.points || 0,
          ctoons: (o.reward?.ctoons || []).map(rc => ({
            name: rc.ctoon?.name || rc.ctoonId,
            quantity: rc.quantity,
            imagePath: rc.ctoon?.assetPath || null,
          })),
          backgrounds: (o.reward?.backgrounds || []).map(rb => ({
            label: rb.background?.label || '',
            imagePath: rb.background?.imagePath || null,
          })),
        }))
      : [],
    // Claimable achievements auto-grant nothing — their reward rows belong to individual
    // claim options above, not to a.rewards[0] (which would otherwise arbitrarily pick one).
    rewards: (!a.isClaimable && a.rewards?.[0])
      ? {
          points: a.rewards[0].points || 0,
          ctoons: (a.rewards[0].ctoons || []).map(rc => ({
            name: rc.ctoon?.name || rc.ctoonId,
            quantity: rc.quantity,
            imagePath: rc.ctoon?.assetPath || null,
          })),
          backgrounds: (a.rewards[0].backgrounds || []).map(rb => ({
            label: rb.background?.label || '',
            imagePath: rb.background?.imagePath || null
          }))
        }
      : { points: 0, ctoons: [], backgrounds: [] },
  }))
})
