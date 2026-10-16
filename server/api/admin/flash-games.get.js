// server/api/admin/flash-games.get.js — full list for the admin "Flash Arcade" management page,
// active and inactive alike (the public listing at /api/flash-games.get.js filters to active only).
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const games = await db.flashGame.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  return { games }
})
