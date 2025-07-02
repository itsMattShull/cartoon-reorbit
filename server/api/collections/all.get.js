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

    // 3. Get ownership info for this user
    const owned = await prisma.userCtoon.findMany({
      where: { userId, ctoonId: { in: ctoons.map(c => c.id) } },
      select: { ctoonId: true }
    })
    const ownedSet = new Set(owned.map(o => o.ctoonId))

    // 4. Merge and return all results with isOwned flag
    return ctoons.map(c => ({
      ...c,
      isOwned: ownedSet.has(c.id)
    }))

  } catch (err) {
    console.error('Error fetching all collections:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch collections' })
  }
})
