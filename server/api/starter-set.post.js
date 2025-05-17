import { PrismaClient } from '@prisma/client'
export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody(event)
  const { ctoonIds } = body

  if (!Array.isArray(ctoonIds) || ctoonIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid ctoonIds' })
  }

  // Fetch cToon definitions and existing ownerships
  const [ctoDetails, existingCtoons] = await Promise.all([
    prisma.ctoon.findMany({ where: { id: { in: ctoonIds } } }),
    prisma.userCtoon.findMany({
      where: {
        userId,
        ctoonId: { in: ctoonIds }
      }
    })
  ])

  const existingMap = new Map(existingCtoons.map(uc => [uc.ctoonId, uc]))

  const toInsert = []

  for (const ctoon of ctoDetails) {
    const alreadyOwned = existingMap.get(ctoon.id)

    if (ctoon.perUserLimit !== null && alreadyOwned) {
      // Skip if user already reached the limit
      const count = await prisma.userCtoon.count({
        where: { userId, ctoonId: ctoon.id }
      })
      if (count >= ctoon.perUserLimit) continue
    }

    const totalMinted = await prisma.userCtoon.count({
      where: { ctoonId: ctoon.id }
    })

    toInsert.push({
      userId,
      ctoonId: ctoon.id,
      mintNumber: totalMinted + 1,
      userPurchased: false
    })
  }

  if (toInsert.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'No cToons could be granted (already owned or over limit)' })
  }

  await prisma.userCtoon.createMany({ data: toInsert })

  return { success: true, added: toInsert.length }
})