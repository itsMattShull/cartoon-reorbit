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

  const where = {
    createdAt: { gte: from, lte: to },
    ...(searchId ? { cZoneSearchId: searchId } : {})
  }

  const [appearanceCounts, captureCounts] = await Promise.all([
    db.cZoneSearchAppearance.groupBy({
      by: ['ctoonId'],
      where,
      _count: { _all: true }
    }),
    db.cZoneSearchCapture.groupBy({
      by: ['ctoonId'],
      where,
      _count: { _all: true }
    })
  ])

  const ctoonIds = new Set([
    ...appearanceCounts.map((row) => row.ctoonId),
    ...captureCounts.map((row) => row.ctoonId)
  ])

  const ctoons = ctoonIds.size
    ? await db.ctoon.findMany({
      where: { id: { in: Array.from(ctoonIds) } },
      select: { id: true, name: true, rarity: true }
    })
    : []

  const ctoonMap = new Map(ctoons.map((ctoon) => [ctoon.id, ctoon]))
  const appearanceCountMap = new Map(appearanceCounts.map((row) => [row.ctoonId, row._count._all || 0]))
  const captureCountMap = new Map(captureCounts.map((row) => [row.ctoonId, row._count._all || 0]))

  const totalAppearances = appearanceCounts.reduce((sum, row) => sum + (row._count._all || 0), 0)
  const totalCaptures = captureCounts.reduce((sum, row) => sum + (row._count._all || 0), 0)

  const rows = Array.from(ctoonIds)
    .map((ctoonId) => {
      const appearances = appearanceCountMap.get(ctoonId) || 0
      const captures = captureCountMap.get(ctoonId) || 0
      const appearancePercent = totalAppearances ? (appearances / totalAppearances) * 100 : 0
      const captureRate = appearances ? (captures / appearances) * 100 : 0
      return {
        ctoonId,
        appearances,
        captures,
        appearancePercent,
        captureRate,
        ctoon: ctoonMap.get(ctoonId) || null
      }
    })
    .sort((a, b) => (b.appearancePercent - a.appearancePercent) || (b.appearances - a.appearances))

  return {
    totals: { appearances: totalAppearances, captures: totalCaptures },
    rows
  }
})
