// server/api/flash-games.get.js — public listing for pages/newsite/flash-games/index.vue.
// Active-only; no auth required (same as the other game catalog pages on this site).
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async () => {
  const games = await db.flashGame.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, title: true, description: true, thumbnailPath: true },
  })

  return { games }
})
