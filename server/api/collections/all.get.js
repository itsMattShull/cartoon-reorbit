// server/api/collections/all.get.js

import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
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

  // 2. Parse pagination parameters
  const { skip = '0', take = '50' } = getQuery(event)
  const skipNum = parseInt(skip, 10)
  const takeNum = parseInt(take, 10)

  // 3. Fetch a page of cToons
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
      price:       true    // include if you support price‐based sorting
    }
  })

  // 4. Determine which of these the user owns
  const owned = await prisma.userCtoon.findMany({
    where: { userId: me.id, ctoonId: { in: ctoons.map(c => c.id) } },
    select: { ctoonId: true }
  })
  const ownedSet = new Set(owned.map(o => o.ctoonId))

  // 5. Merge and return
  return ctoons.map(c => ({
    ...c,
    isOwned: ownedSet.has(c.id)
  }))
})
