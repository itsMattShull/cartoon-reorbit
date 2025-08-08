// server/api/collections/all.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Authenticate the user
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
    // 2. Fetch all cToons, ordered by releaseDate
    const ctoons = await prisma.ctoon.findMany({
      orderBy: { releaseDate: 'desc' },
      select: {
        id:          true,
        name:        true,
        assetPath:   true,
        releaseDate: true,
        set:         true,
        series:      true,
        rarity:      true,
        price:       true
      }
    })

    // 3. Which of these the user owns?
    const owned = await prisma.userCtoon.findMany({
      where: { userId, ctoonId: { in: ctoons.map(c => c.id) } },
      select: { ctoonId: true }
    })
    const ownedSet = new Set(owned.map(o => o.ctoonId))

    // 4. Compute highest mintNumber per ctoon across all users
    const maxMintRecords = await prisma.userCtoon.groupBy({
      by: ['ctoonId'],
      where: { ctoonId: { in: ctoons.map(c => c.id) } },
      _max: { mintNumber: true }
    })
    const maxMintMap = new Map(
      maxMintRecords.map(r => [r.ctoonId, r._max.mintNumber ?? 0])
    )

    // 5. Merge and return
    return ctoons.map(c => ({
      ...c,
      isOwned:     ownedSet.has(c.id),
      highestMint: maxMintMap.get(c.id) || 0
    }))

  } catch (err) {
    console.error('Error fetching all collections:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch collections' })
  }
})
