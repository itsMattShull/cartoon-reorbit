// server/api/backgrounds-available.get.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const owned = await db.userBackground.findMany({
    where: { userId },
    select: { backgroundId: true }
  })
  const ownedIds = owned.map(o => o.backgroundId)

  const bgs = await db.background.findMany({
    where: {
      OR: [ { visibility: 'PUBLIC' }, { id: { in: ownedIds } } ]
    },
    orderBy: { createdAt: 'desc' }
  })
  return bgs
})
