// server/api/admin/search-ctoons.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Auth: admin only
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

  // 2) Input
  const { q = '' } = getQuery(event)
  const query = String(q).trim()
  if (query.length < 3) {
    // keep it strict; front-end enforces this too
    return []
  }

  // 3) Find ALL matches by name (case-insensitive)
  const ctoons = await prisma.ctoon.findMany({
    where: {
      name: { contains: query, mode: 'insensitive' }
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      set: true,
      series: true,
      assetPath: true,
      releaseDate: true,
      quantity: true,
      rarity: true,
      inCmart: true
    }
  })

  if (!ctoons.length) return []

  // 4) Highest mint for these ids
  const ids = ctoons.map(c => c.id)
  const mintGroups = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { ctoonId: { in: ids } },
    _max: { mintNumber: true }
  })
  const mintMap = {}
  for (const g of mintGroups) mintMap[g.ctoonId] = g._max.mintNumber || 0

  // 5) Merge + return
  return ctoons.map(c => ({ ...c, highestMint: mintMap[c.id] || 0 }))
})
