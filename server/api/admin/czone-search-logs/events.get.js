import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

function clampDays(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 30
  return Math.max(1, Math.min(365, Math.floor(num)))
}

function clampLimit(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 100
  return Math.max(1, Math.min(500, Math.floor(num)))
}

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

  const q = getQuery(event)
  const days = clampDays(q.days)
  const limit = clampLimit(q.limit)
  const searchId = typeof q.searchId === 'string' ? q.searchId : ''
  const to = new Date()
  const from = new Date(Date.now() - days * 24 * 3600 * 1000)

  const where = {
    createdAt: { gte: from, lte: to },
    ...(searchId ? { cZoneSearchId: searchId } : {})
  }

  const [appearances, captures] = await Promise.all([
    db.cZoneSearchAppearance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, username: true } },
        zoneOwner: { select: { id: true, username: true } },
        ctoon: { select: { id: true, name: true, rarity: true } },
        cZoneSearch: { select: { id: true, startAt: true, endAt: true } }
      }
    }),
    db.cZoneSearchCapture.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, username: true } },
        ctoon: { select: { id: true, name: true, rarity: true } },
        cZoneSearch: { select: { id: true, startAt: true, endAt: true } }
      }
    })
  ])

  return { appearances, captures }
})
