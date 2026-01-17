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
        set: true, series: true, rarity: true, price: true,
        isGtoon: true,
        totalMinted: true, // ← use aggregate stored on Ctoon
      }
    })
    if (ctoons.length === 0) return []

    const ids = ctoons.map(c => c.id)

    const [owned, holidayRows] = await Promise.all([
      prisma.userCtoon.findMany({
        where: { userId, ctoonId: { in: ids } },
        select: { ctoonId: true }
      }),
      prisma.holidayEventItem.findMany({
        where: { ctoonId: { in: ids } },
        select: { ctoonId: true }
      })
    ])

    const ownedSet   = new Set(owned.map(o => o.ctoonId))
    const holidaySet = new Set(holidayRows.map(h => h.ctoonId))

    return ctoons.map(c => ({
      ...c,
      isOwned:       ownedSet.has(c.id),
      highestMint:   c.totalMinted ?? 0,
      isHolidayItem: holidaySet.has(c.id)
    }))
  } catch (err) {
    console.error('Error fetching all collections:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch collections' })
  }
})
