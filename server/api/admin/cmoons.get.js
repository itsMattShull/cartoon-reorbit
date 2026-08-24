// server/api/admin/cmoons.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [cmoons, config] = await Promise.all([
    db.cMoon.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        captains: { include: { user: { select: { id: true, username: true } } } },
        prizeCtoons: { include: { ctoon: { select: { id: true, name: true, assetPath: true } } } },
        ranks: { orderBy: { sortOrder: 'asc' } },
        // Single grouped query, not a per-cMoon count() loop.
        _count: { select: { displayedCtoons: true } },
      },
    }),
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { cMoonEnabled: true, cMoonEnabledAt: true, cMoonSelectionDeadlineAt: true } }),
  ])

  return {
    cMoonEnabled: !!config?.cMoonEnabled,
    cMoonEnabledAt: config?.cMoonEnabledAt || null,
    cMoonSelectionDeadlineAt: config?.cMoonSelectionDeadlineAt || null,
    cmoons: cmoons.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      imagePath: c.imagePath,
      discordRoleId: c.discordRoleId,
      effectType: c.effectType,
      joinLocked: c.joinLocked,
      memberCount: c.memberCount,
      pageImagePath: c.pageImagePath,
      pageDescription: c.pageDescription,
      bannerImagePath: c.bannerImagePath,
      displayedCtoonCount: c._count?.displayedCtoons ?? 0,
      captains: c.captains.map(cap => ({ userId: cap.userId, username: cap.user?.username || '' })),
      prizeCtoons: c.prizeCtoons.map(pc => ({ ctoonId: pc.ctoonId, quantity: pc.quantity, name: pc.ctoon?.name || '', assetPath: pc.ctoon?.assetPath || null })),
      ranks: c.ranks.map(r => ({ id: r.id, name: r.name, sortOrder: r.sortOrder, discordRoleId: r.discordRoleId })),
    })),
  }
})
