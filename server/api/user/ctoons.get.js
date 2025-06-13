// server/api/user/ctoons.get.js
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Ensure the user is authenticated
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // 2) Parse an optional `exclude` array of ctoon-IDs from the querystring
  const { exclude } = getQuery(event)
  let excludeIds = []
  if (exclude) {
    try {
      excludeIds = JSON.parse(exclude)
    } catch (e) {
      // ignore invalid JSON
    }
  }

  // 3) Query tradeable UserCtoons for that user, omitting excluded IDs
  const rows = await prisma.userCtoon.findMany({
    where: {
      userId,
      isTradeable: true,
      id: { notIn: excludeIds }
    },
    select: {
      id: true,
      mintNumber: true,
      isFirstEdition: true,
      ctoon: {
        select: {
          assetPath: true,
          name: true,
          set: true,
          series: true,
          rarity: true,
          releaseDate: true
        }
      }
    }
  })

  // 4) Shape the response
  return rows.map(uc => ({
    id: uc.id,
    assetPath: uc.ctoon.assetPath,
    name: uc.ctoon.name,
    mintNumber: uc.mintNumber,
    rarity: uc.ctoon.rarity,
    isFirstEdition: uc.isFirstEdition,
    set: uc.ctoon.set,
    series: uc.ctoon.series,
    releaseDate: uc.ctoon.releaseDate
  }))
})