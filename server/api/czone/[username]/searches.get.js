import { defineEventHandler, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma as db } from '@/server/prisma'

function clampPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(100, num))
}

function pickWeighted(pool) {
  const weights = pool.map(p => clampPercent(p.chancePercent))
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return null
  let roll = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const { username } = event.context.params
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Missing username' })

  const zoneOwner = await db.user.findUnique({
    where: { username },
    select: { id: true }
  })
  if (!zoneOwner) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  if (zoneOwner.id === userId) {
    return { items: [] }
  }

  const now = new Date()
  const searches = await db.cZoneSearch.findMany({
    where: {
      startAt: { lte: now },
      endAt: { gte: now }
    },
    orderBy: { endAt: 'asc' },
    include: {
      prizePool: {
        include: {
          ctoon: {
            select: { id: true, name: true, rarity: true, assetPath: true }
          }
        }
      }
    }
  })

  if (!searches.length) return { items: [] }

  const searchIds = searches.map(s => s.id)
  const lastAppearances = await db.cZoneSearchAppearance.groupBy({
    by: ['cZoneSearchId'],
    where: {
      userId,
      cZoneSearchId: { in: searchIds }
    },
    _max: { createdAt: true }
  })
  const lastMap = new Map()
  for (const row of lastAppearances) {
    lastMap.set(row.cZoneSearchId, row._max.createdAt)
  }

  const onceIds = searches.filter(s => s.collectionType === 'ONCE').map(s => s.id)
  const capturedMap = new Map()
  if (onceIds.length) {
    const capturedRows = await db.cZoneSearchCapture.findMany({
      where: {
        userId,
        cZoneSearchId: { in: onceIds }
      },
      select: { cZoneSearchId: true, ctoonId: true }
    })
    for (const row of capturedRows) {
      if (!capturedMap.has(row.cZoneSearchId)) {
        capturedMap.set(row.cZoneSearchId, new Set())
      }
      capturedMap.get(row.cZoneSearchId).add(row.ctoonId)
    }
  }

  const dailyLimitIds = searches
    .filter(s => (s.resetType || 'COOLDOWN_HOURS') === 'DAILY_AT_RESET')
    .filter(s => Number(s.dailyCollectLimit ?? 0) > 0)
    .map(s => s.id)
  const dailyCaptureMap = new Map()
  if (dailyLimitIds.length) {
    const chicagoNow = DateTime.now().setZone('America/Chicago')
    let boundaryLocal = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
    if (chicagoNow < boundaryLocal) {
      boundaryLocal = boundaryLocal.minus({ days: 1 })
    }
    const boundaryUtc = boundaryLocal.toUTC().toJSDate()
    const dailyCaptureCounts = await db.cZoneSearchCapture.groupBy({
      by: ['cZoneSearchId'],
      where: {
        userId,
        cZoneSearchId: { in: dailyLimitIds },
        createdAt: { gte: boundaryUtc }
      },
      _count: { _all: true }
    })
    for (const row of dailyCaptureCounts) {
      dailyCaptureMap.set(row.cZoneSearchId, row._count._all || 0)
    }
  }

  const customIds = searches.filter(s => s.collectionType === 'CUSTOM_PER_CTOON').map(s => s.id)
  const customCaptureMap = new Map()
  if (customIds.length) {
    const customCaptureCounts = await db.cZoneSearchCapture.groupBy({
      by: ['cZoneSearchId', 'ctoonId'],
      where: {
        userId,
        cZoneSearchId: { in: customIds }
      },
      _count: { _all: true }
    })
    for (const row of customCaptureCounts) {
      if (!customCaptureMap.has(row.cZoneSearchId)) {
        customCaptureMap.set(row.cZoneSearchId, new Map())
      }
      customCaptureMap.get(row.cZoneSearchId).set(row.ctoonId, row._count._all || 0)
    }
  }

  const items = []
  for (const search of searches) {
    const resetType = search.resetType || 'COOLDOWN_HOURS'
    if (resetType === 'COOLDOWN_HOURS') {
      const lastSeen = lastMap.get(search.id)
      if (search.cooldownHours > 0 && lastSeen) {
        const nextAllowed = new Date(lastSeen.getTime() + search.cooldownHours * 3600 * 1000)
        if (nextAllowed > now) continue
      }
    } else if (resetType === 'DAILY_AT_RESET') {
      const dailyLimit = Number(search.dailyCollectLimit ?? 0)
      if (dailyLimit > 0) {
        const capturedToday = dailyCaptureMap.get(search.id) || 0
        if (capturedToday >= dailyLimit) continue
      }
    }

    const appearanceRate = clampPercent(search.appearanceRatePercent)
    if (appearanceRate <= 0) continue
    if (Math.random() * 100 >= appearanceRate) continue

    const capturedSet = search.collectionType === 'ONCE' ? (capturedMap.get(search.id) || new Set()) : null
    const customCaptured = search.collectionType === 'CUSTOM_PER_CTOON'
      ? (customCaptureMap.get(search.id) || new Map())
      : null
    const eligiblePool = search.prizePool.filter((row) => {
      if (!row?.ctoon) return false
      if (search.collectionType === 'ONCE' && capturedSet?.has(row.ctoonId)) return false
      if (search.collectionType === 'CUSTOM_PER_CTOON') {
        const maxCaptures = Number(row.maxCaptures ?? 0)
        if (maxCaptures > 0) {
          const capturedCount = customCaptured?.get(row.ctoonId) || 0
          if (capturedCount >= maxCaptures) return false
        }
      }
      return clampPercent(row.chancePercent) > 0
    })

    const chosen = pickWeighted(eligiblePool)
    if (!chosen) continue

    const appearance = await db.cZoneSearchAppearance.create({
      data: {
        cZoneSearchId: search.id,
        userId,
        ctoonId: chosen.ctoonId,
        zoneOwnerId: zoneOwner.id
      }
    })

    items.push({
      appearanceId: appearance.id,
      cZoneSearchId: search.id,
      ctoon: {
        id: chosen.ctoon.id,
        name: chosen.ctoon.name,
        rarity: chosen.ctoon.rarity,
        assetPath: chosen.ctoon.assetPath
      }
    })
  }

  return { items }
})
