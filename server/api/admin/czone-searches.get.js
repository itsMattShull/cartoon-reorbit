import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
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

  const { showAll } = getQuery(event)
  const includeAll = String(showAll || '').toLowerCase() === 'true' || String(showAll || '') === '1'
  const now = new Date()

  const searches = await db.cZoneSearch.findMany({
    where: includeAll ? {} : { endAt: { gte: now } },
    orderBy: { endAt: 'asc' },
    include: {
      prizePool: {
        orderBy: { chancePercent: 'desc' },
        include: {
          ctoon: {
            select: { id: true, name: true, rarity: true, assetPath: true }
          }
        }
      }
    }
  })

  return searches
})
