// server/api/admin/all-ctoons.get.js


import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2. Parse pagination parameters
  const { skip = '0', take = '50' } = getQuery(event)
  const skipNum = parseInt(skip, 10)
  const takeNum = parseInt(take, 10)

  // 3. Fetch a page of cToons
  const ctoons = await prisma.ctoon.findMany({
    orderBy: { createdAt: 'desc' },
    skip: skipNum,
    take: takeNum,
    select: {
      id:         true,
      name:       true,
      set: true,
      series: true,
      assetPath:  true,
      releaseDate:true,
      quantity:   true,
      rarity: true,
      inCmart:    true
    }
  })

  // 4. Load highest mintNumber for only these cToons
  const mintGroups = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { ctoonId: { in: ctoons.map(c => c.id) } },
    _max: { mintNumber: true }
  })
  const mintMap = {}
  for (const g of mintGroups) {
    mintMap[g.ctoonId] = g._max.mintNumber || 0
  }

  // 5. Merge and return
  return ctoons.map(c => ({
    ...c,
    highestMint: mintMap[c.id] || 0
  }))
})
