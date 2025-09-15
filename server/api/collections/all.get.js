// server/api/collections/all.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  try {
    const ctoons = await prisma.ctoon.findMany({
      orderBy: { releaseDate: 'desc' },
      select: {
        id: true, name: true, assetPath: true, releaseDate: true,
        set: true, series: true, rarity: true, price: true
      }
    })
    if (ctoons.length === 0) return []

    const ids = ctoons.map(c => c.id)

    const [owned, maxMintRecords, holidayRows] = await Promise.all([
      prisma.userCtoon.findMany({
        where: { userId, ctoonId: { in: ids } },
        select: { ctoonId: true }
      }),
      prisma.userCtoon.groupBy({
        by: ['ctoonId'],
        where: { ctoonId: { in: ids } },
        _max: { mintNumber: true }
      }),
      // Flag as Holiday Item if it appears in ANY HolidayEventItem
      prisma.holidayEventItem.findMany({
        where: { ctoonId: { in: ids } },
        select: { ctoonId: true }
      })
    ])

    const ownedSet    = new Set(owned.map(o => o.ctoonId))
    const holidaySet  = new Set(holidayRows.map(h => h.ctoonId))
    const maxMintMap  = new Map(maxMintRecords.map(r => [r.ctoonId, r._max.mintNumber ?? 0]))

    return ctoons.map(c => ({
      ...c,
      isOwned:       ownedSet.has(c.id),
      highestMint:   maxMintMap.get(c.id) || 0,
      isHolidayItem: holidaySet.has(c.id)
    }))
  } catch (err) {
    console.error('Error fetching all collections:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch collections' })
  }
})
