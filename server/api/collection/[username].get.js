// server/api/collection/[username].get.js
import { createError, defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const usernameParam = event.context.params.username

  const userWithCtoons = await prisma.user.findUnique({
    where: { username: usernameParam },
    include: {
      ctoons: {
        where: { isTradeable: true },
        include: { ctoon: true }
      }
    }
  })

  if (!userWithCtoons) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return userWithCtoons.ctoons.map(uc => ({
    id: uc.id,
    ctoonId: uc.ctoonId,
    assetPath: uc.ctoon.assetPath,
    name: uc.ctoon.name,
    series: uc.ctoon.series,
    rarity: uc.ctoon.rarity,
    mintNumber: uc.mintNumber,
    quantity: uc.ctoon.quantity,
    isFirstEdition: uc.isFirstEdition
  }))
})
