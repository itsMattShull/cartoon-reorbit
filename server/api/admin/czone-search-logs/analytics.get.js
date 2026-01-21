import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

function clampDays(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 30
  return Math.max(1, Math.min(365, Math.floor(num)))
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
  const searchId = typeof q.searchId === 'string' ? q.searchId : ''
  const to = new Date()
  const from = new Date(Date.now() - days * 24 * 3600 * 1000)

  const appearanceWhere = {
    createdAt: { gte: from, lte: to },
    ...(searchId ? { cZoneSearchId: searchId } : {})
  }
  const captureWhere = {
    createdAt: { gte: from, lte: to },
    ...(searchId ? { cZoneSearchId: searchId } : {})
  }

  const [appearanceCounts, captureCounts, uniqueViewRows, uniqueCaptureRows] = await Promise.all([
    db.cZoneSearchAppearance.groupBy({
      by: ['cZoneSearchId'],
      where: appearanceWhere,
      _count: { _all: true }
    }),
    db.cZoneSearchCapture.groupBy({
      by: ['cZoneSearchId'],
      where: captureWhere,
      _count: { _all: true }
    }),
    db.cZoneSearchAppearance.groupBy({
      by: ['cZoneSearchId', 'userId'],
      where: appearanceWhere
    }),
    db.cZoneSearchCapture.groupBy({
      by: ['cZoneSearchId', 'userId'],
      where: captureWhere
    })
  ])

  const appearanceMap = new Map()
  for (const row of appearanceCounts) {
    appearanceMap.set(row.cZoneSearchId, row._count._all || 0)
  }
  const captureMap = new Map()
  for (const row of captureCounts) {
    captureMap.set(row.cZoneSearchId, row._count._all || 0)
  }
  const uniqueViewMap = new Map()
  for (const row of uniqueViewRows) {
    uniqueViewMap.set(row.cZoneSearchId, (uniqueViewMap.get(row.cZoneSearchId) || 0) + 1)
  }
  const uniqueCaptureMap = new Map()
  for (const row of uniqueCaptureRows) {
    uniqueCaptureMap.set(row.cZoneSearchId, (uniqueCaptureMap.get(row.cZoneSearchId) || 0) + 1)
  }

  const searchWhere = searchId
    ? { id: searchId }
    : { startAt: { lte: to }, endAt: { gte: from } }

  const searches = await db.cZoneSearch.findMany({
    where: searchWhere,
    orderBy: { endAt: 'asc' },
    select: {
      id: true,
      name: true,
      startAt: true,
      endAt: true,
      appearanceRatePercent: true,
      cooldownHours: true,
      collectionType: true
    }
  })

  const searchStats = searches.map((s) => {
    const appearances = appearanceMap.get(s.id) || 0
    const captures = captureMap.get(s.id) || 0
    const uniqueViewers = uniqueViewMap.get(s.id) || 0
    const uniqueCaptures = uniqueCaptureMap.get(s.id) || 0
    const captureRate = appearances ? Math.round((captures / appearances) * 100) : 0
    return {
      ...s,
      appearances,
      captures,
      uniqueViewers,
      uniqueCaptures,
      captureRate
    }
  })

  const totals = {
    appearances: Array.from(appearanceMap.values()).reduce((sum, v) => sum + v, 0),
    captures: Array.from(captureMap.values()).reduce((sum, v) => sum + v, 0),
    uniqueViewers: Array.from(uniqueViewMap.values()).reduce((sum, v) => sum + v, 0),
    uniqueCaptures: Array.from(uniqueCaptureMap.values()).reduce((sum, v) => sum + v, 0)
  }
  totals.captureRate = totals.appearances ? Math.round((totals.captures / totals.appearances) * 100) : 0

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    days,
    totals,
    searches: searchStats
  }
})
