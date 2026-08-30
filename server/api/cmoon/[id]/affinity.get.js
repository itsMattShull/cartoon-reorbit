// server/api/cmoon/[id]/affinity.get.js
// The caller's OWN "contribute to cMoon" progress plus this cMoon's public affinity ladder.
// Kept as its own lightweight endpoint rather than folded into GET /api/cmoon/[id]: that route's
// payload is identical for every viewer and briefly cached (see server/api/cmoons.get.js /
// invalidateCMoonList), while this one is per-caller and must never be — bundling them would
// either poison that cache or force it to stop caching entirely. Never accepts a target userId —
// only ever returns the authenticated caller's own contribution amount.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const cMoonId = event.context.params?.id
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const [levels, affinity, me] = await Promise.all([
    db.cMoonAffinityLevel.findMany({
      where: { cMoonId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, name: true, threshold: true, sortOrder: true, grantsBorder: true,
        rewardBackground: { select: { id: true, label: true, imagePath: true } },
        rewardAvatar: { select: { id: true, label: true, imagePath: true } },
      }
    }),
    db.cMoonAffinity.findUnique({
      where: { userId_cMoonId: { userId, cMoonId } },
      select: { affinitySpent: true, currentLevelId: true }
    }),
    db.user.findUnique({ where: { id: userId }, select: { cMoonId: true } })
  ])

  const affinitySpent = affinity?.affinitySpent || 0
  const nextLevel = levels.find(l => l.threshold > affinitySpent) || null

  return {
    isMember: me?.cMoonId === cMoonId,
    affinitySpent,
    currentLevelId: affinity?.currentLevelId || null,
    nextLevel: nextLevel ? { id: nextLevel.id, name: nextLevel.name, threshold: nextLevel.threshold } : null,
    levels,
  }
})
