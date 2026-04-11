// server/api/admin/dissolve-queue/index.get.js
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
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const allEntries = await prisma.dissolveAuctionQueue.findMany({
    include: {
      userCtoon: {
        select: {
          id: true,
          mintNumber: true,
          ctoon: { select: { name: true, rarity: true, series: true, assetPath: true } }
        }
      }
    },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }]
  })

  const byCategory = {
    POKEMON:    { total: 0, scheduled: 0, unscheduled: 0 },
    CRAZY_RARE: { total: 0, scheduled: 0, unscheduled: 0 },
    OTHER:      { total: 0, scheduled: 0, unscheduled: 0 },
  }

  for (const e of allEntries) {
    const cat = byCategory[e.category] || byCategory.OTHER
    cat.total++
    if (e.scheduledFor) cat.scheduled++
    else cat.unscheduled++
  }

  const mapEntry = (e) => ({
    id:           e.id,
    category:     e.category,
    isFeatured:   e.isFeatured,
    scheduledFor: e.scheduledFor,
    createdAt:    e.createdAt,
    ctoonName:    e.userCtoon?.ctoon?.name ?? null,
    ctoonImage:   e.userCtoon?.ctoon?.assetPath ?? null,
    rarity:       e.userCtoon?.ctoon?.rarity ?? null,
    series:       e.userCtoon?.ctoon?.series ?? null,
    mintNumber:   e.userCtoon?.mintNumber ?? null,
  })

  // Next 20 scheduled entries
  const upcoming = allEntries
    .filter(e => e.scheduledFor)
    .slice(0, 20)
    .map(mapEntry)

  // All entries for search/pagination on the frontend
  const entries = allEntries.map(mapEntry)

  return {
    total: allEntries.length,
    byCategory,
    upcoming,
    entries,
  }
})
