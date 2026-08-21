// server/api/admin/cmoons.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const [cmoons, config] = await Promise.all([
    db.cMoon.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        captains: { include: { user: { select: { id: true, username: true } } } },
        prizeCtoons: { include: { ctoon: { select: { id: true, name: true, assetPath: true } } } },
        ranks: { orderBy: { sortOrder: 'asc' } },
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
      discordRoleId: c.discordRoleId,
      memberCount: c.memberCount,
      captains: c.captains.map(cap => ({ userId: cap.userId, username: cap.user?.username || '' })),
      prizeCtoons: c.prizeCtoons.map(pc => ({ ctoonId: pc.ctoonId, quantity: pc.quantity, name: pc.ctoon?.name || '', assetPath: pc.ctoon?.assetPath || null })),
      ranks: c.ranks.map(r => ({ id: r.id, name: r.name, sortOrder: r.sortOrder, discordRoleId: r.discordRoleId })),
    })),
  }
})
