// server/api/admin/search-ctoons.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Auth: admin only
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

  // Inputs
  const { q = '', set = '', series = '', excludeSecondEdition = '', excludeId = '' } = getQuery(event)
  const query  = String(q).trim()
  const bySet  = String(set).trim()
  const bySer  = String(series).trim()
  const excludeSecondEditionBool = String(excludeSecondEdition) === 'true'
  const excludeIdVal = String(excludeId).trim()

  // Require either q>=3 or at least one filter
  if (query.length < 3 && !bySet && !bySer) return []

  // Build where
  const where = {
    AND: [
      query.length >= 3 ? { name: { contains: query, mode: 'insensitive' } } : {},
      bySet ?   { set:    { equals: bySet } }   : {},
      bySer ?   { series: { equals: bySer } }   : {},
      excludeSecondEditionBool ? { isSecondEdition: false } : {},
      excludeIdVal ? { id: { not: excludeIdVal } } : {}
    ]
  }

  // Base rows
  const ctoons = await prisma.ctoon.findMany({
    where,
    orderBy: [{ name: 'asc' }],
    take: 20,
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

  // Highest mint per ctoon
  const ids = ctoons.map(c => c.id)
  const mintGroups = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { ctoonId: { in: ids } },
    _max: { mintNumber: true }
  })
  const mintMap = {}
  for (const g of mintGroups) mintMap[g.ctoonId] = g._max.mintNumber || 0

  return ctoons.map(c => ({ ...c, highestMint: mintMap[c.id] || 0 }))
})
