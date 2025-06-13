// server/api/auctions.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Authenticate
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
        select: {
          ctoonId: true,
          mintNumber: true,
          ctoon: {
            select: {
              name: true,
              series: true,
              rarity: true,
              assetPath: true
            }
          }
        }
      }
    },
    orderBy: { endAt: 'asc' }
  })

  // 3. Get the set of ctoonIds this user owns (any UserCtoon)
  const ctoonIds = auctions.map(a => a.userCtoon.ctoonId)
  const owned = await prisma.userCtoon.findMany({
    where: {
      userId,
      ctoonId: { in: ctoonIds }
    },
    select: { ctoonId: true }
  })
  const ownedSet = new Set(owned.map(u => u.ctoonId))

  // 4. Map to the shape the client expects
  return auctions.map(a => ({
    id:          a.id,
    name:        a.userCtoon.ctoon.name,
    series:      a.userCtoon.ctoon.series,
    rarity:      a.userCtoon.ctoon.rarity,
    mintNumber:  a.userCtoon.mintNumber,
    assetPath:   a.userCtoon.ctoon.assetPath,
    endAt:       a.endAt.toISOString(),
    // true if the user owns at least one of that cToon
    isOwned:     ownedSet.has(a.userCtoon.ctoonId)
  }))
})
