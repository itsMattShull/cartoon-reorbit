// A small, dedicated lookup for the room builder's faction-theme dropdown — deliberately NOT
// reusing /api/admin/cmoons.get.js, which loads every cMoon's full admin config (affinity levels,
// ranks, captains, prize cToons, ...) just to populate a <select>.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const cmoons = await db.cMoon.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true, avatarPath: true }
  })
  return { cmoons }
})
