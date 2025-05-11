import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const { ctoonId } = await readBody(event)
  if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'Missing ctoonId' })

  const ctoon = await prisma.ctoon.findUnique({
    where: { id: ctoonId }
  })

  const totalMinted = await prisma.userCtoon.count({
    where: { ctoonId }
  })

  const existing = await prisma.userCtoon.findMany({
    where: {
      userId,
      ctoonId
    }
  })

  if (!ctoon || !ctoon.inCmart) {
    throw createError({ statusCode: 404, statusMessage: 'cToon not found or not for sale' })
  }

  // Check if the cToon is sold out based on minted total
  if (ctoon.quantity !== null && totalMinted >= ctoon.quantity) {
    throw createError({ statusCode: 410, statusMessage: 'cToon sold out' })
  }

  const wallet = await prisma.userPoints.findUnique({ where: { userId } })
  if (!wallet || wallet.points < ctoon.price) {
    throw createError({ statusCode: 400, statusMessage: 'Insufficient points' })
  }

  if (ctoon.perUserLimit !== null && existing.length >= ctoon.perUserLimit) {
    throw createError({
      statusCode: 403,
      statusMessage: `You can only purchase this cToon up to ${ctoon.perUserLimit} time(s)`
    })
  }

  await prisma.$transaction([
    prisma.userPoints.update({
      where: { userId },
      data: { points: { decrement: ctoon.price } }
    }),

    prisma.userCtoon.create({
      data: {
        userId,
        ctoonId,
        mintNumber: totalMinted + 1
      }
    })
  ])

  return { success: true, message: 'cToon purchased successfully' }
})