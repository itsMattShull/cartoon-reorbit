// server/api/collections.get.js

import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Authenticate user
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    // 2. Fetch all UserCtoons for user, including nested Ctoon and active auctions
    const userCtoons = await prisma.userCtoon.findMany({
      where: { userId },
      include: {
        ctoon: true,
        auctions: {
          where: { status: 'ACTIVE' }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    // 3. Map → shape response
    return userCtoons.map((uc) => ({
      id:              uc.id,
      userId:          uc.userId,
      name:            uc.ctoon.name,
      set:             uc.ctoon.set,
      series:          uc.ctoon.series,
      type:            uc.ctoon.type,
      rarity:          uc.ctoon.rarity,
      assetPath:       uc.ctoon.assetPath,
      releaseDate:     uc.ctoon.releaseDate,
      price:           uc.ctoon.price,
      initialQuantity: uc.ctoon.initialQuantity,
      quantity:        uc.ctoon.quantity,
      characters:      uc.ctoon.characters,
      mintNumber:      uc.mintNumber,
      isFirstEdition:  uc.isFirstEdition,
      auctions:        uc.auctions || []
    }))
  } catch (err) {
    console.error('Error fetching user collections:', err)
    return []
  }
})
