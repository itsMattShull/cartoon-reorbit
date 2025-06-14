// File: server/api/collection/[username].get.js

import { createError, defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { username } = event.context.params
  const { filter } = getQuery(event)

  // Fetch user along with their cToons
  const userWithCtoons = await prisma.user.findUnique({
    where: { username },
    include: {
      ctoons: {
        where: {
          isTradeable: true,
          // If filter=gtoon, only include ctoons marked as gToons
          ...(filter === 'gtoon' ? { ctoon: { isGtoon: true } } : {})
        },
        include: {
          ctoon: true
        }
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
