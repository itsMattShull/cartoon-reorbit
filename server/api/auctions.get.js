// server/api/auctions.get.js


import { defineEventHandler, getRequestHeader, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Authenticate user (reuse your /api/auth/me endpoint)
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

  // 2. Fetch all active auctions with nested Ctoon data
  const auctions = await prisma.auction.findMany({
    where: { status: 'ACTIVE' },
    include: {
      userCtoon: {
        include: { ctoon: true }
      }
    },
    orderBy: { endAt: 'asc' }
  })

  // 3. Map to the shape the client expects
  return auctions.map((a) => ({
    id:          a.id,
    name:        a.userCtoon.ctoon.name,
    series:      a.userCtoon.ctoon.series,
    rarity:      a.userCtoon.ctoon.rarity,
    mintNumber:  a.userCtoon.mintNumber,
    assetPath:   a.userCtoon.ctoon.assetPath,
    endAt:       a.endAt.toISOString(),
    isOwned:    a.userCtoon.userId === me.id
  }))
})
