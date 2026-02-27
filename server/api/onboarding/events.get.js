import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const now = new Date()
  const [holidayEvents, czoneSearches] = await Promise.all([
    db.holidayEvent.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now }
      },
      orderBy: { endsAt: 'asc' },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true
      }
    }),
    db.cZoneSearch.findMany({
      where: {
        startAt: { lte: now },
        endAt: { gte: now }
      },
      orderBy: { endAt: 'asc' },
      select: {
        id: true,
        name: true,
        linkInOnboarding: true,
        startAt: true,
        endAt: true
      }
    })
  ])

  return {
    holidayEvents: holidayEvents.map((row) => ({
      id: row.id,
      name: row.name,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString()
    })),
    czoneSearches: czoneSearches.map((row) => ({
      id: row.id,
      name: row.name,
      linkInOnboarding: row.linkInOnboarding,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString()
    }))
  }
})
