import { defineEventHandler, createError, getQuery } from 'h3'
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

  const query = getQuery(event)
  const zoneIndex = Number.isFinite(Number(query.zoneIndex)) ? Math.max(0, Number(query.zoneIndex)) : 0
  const tzParam = typeof query.tz === 'string' && query.tz.trim() ? query.tz.trim() : 'UTC'
  const tzNow = DateTime.now().setZone(tzParam)
  const viewerNow = tzNow.isValid ? tzNow : DateTime.utc()
  const viewerDate = viewerNow.toISODate()
  const viewerHour = viewerNow.hour

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

  const zoneRow = await db.cZone.findUnique({
    where: { userId: zoneOwner.id },
    select: { layoutData: true, background: true }
  })
  const rawLayout = zoneRow?.layoutData
  const baseZone = {
    background: typeof zoneRow?.background === 'string' ? zoneRow.background : '',
    toons: Array.isArray(rawLayout) ? rawLayout : []
  }
  const zones = (rawLayout && typeof rawLayout === 'object' && Array.isArray(rawLayout.zones))
    ? rawLayout.zones
    : [baseZone]
  const activeZone = zones[zoneIndex] || zones[0] || baseZone
  const zoneBackground = typeof activeZone?.background === 'string' ? activeZone.background : ''
  const zoneToonIds = Array.isArray(activeZone?.toons)
    ? activeZone.toons.map(item => item?.id).filter(Boolean)
    : []
  let zoneCtoonIds = new Set()
  if (zoneToonIds.length) {
    const zoneToons = await db.userCtoon.findMany({
      where: { id: { in: zoneToonIds } },
      select: { ctoonId: true }
    })
    zoneCtoonIds = new Set(zoneToons.map(row => row.ctoonId))
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

  const needsUserOwns = searches.some(s => s.prizePool.some(p => p.conditionUserOwnsEnabled))
  const needsUserPoints = searches.some(s => s.prizePool.some(p => p.conditionUserPointsEnabled))
  const needsUserTotal = searches.some(s => s.prizePool.some(p => p.conditionUserTotalCountEnabled))
  const needsUserUnique = searches.some(s => s.prizePool.some(p => p.conditionUserUniqueCountEnabled))
  const ownsIds = new Set()
  if (needsUserOwns) {
    for (const search of searches) {
      for (const row of search.prizePool) {
        if (!row.conditionUserOwnsEnabled) continue
        const entries = Array.isArray(row.conditionUserOwns) ? row.conditionUserOwns : []
        for (const entry of entries) {
          if (entry?.ctoonId) ownsIds.add(entry.ctoonId)
        }
      }
    }
  }

  let userPoints = 0
  if (needsUserPoints) {
    const pointsRow = await db.userPoints.findUnique({
      where: { userId },
      select: { points: true }
    })
    userPoints = Number(pointsRow?.points || 0)
  }

  let userTotalCount = 0
  if (needsUserTotal) {
    userTotalCount = await db.userCtoon.count({
      where: { userId, burnedAt: null }
    })
  }

  let userUniqueCount = 0
  if (needsUserUnique) {
    const uniqueRows = await db.userCtoon.groupBy({
      by: ['ctoonId'],
      where: { userId, burnedAt: null }
    })
    userUniqueCount = uniqueRows.length
  }

  const userOwnsCountMap = new Map()
  if (needsUserOwns && ownsIds.size) {
    const ownedCounts = await db.userCtoon.groupBy({
      by: ['ctoonId'],
      where: {
        userId,
        burnedAt: null,
        ctoonId: { in: Array.from(ownsIds) }
      },
      _count: { _all: true }
    })
    for (const row of ownedCounts) {
      userOwnsCountMap.set(row.ctoonId, row._count._all || 0)
    }
  }

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
      if (row.conditionDateEnabled) {
        const start = String(row.conditionDateStart || '')
        const end = String(row.conditionDateEnd || '')
        if (!start || !end) return false
        if (viewerDate < start || viewerDate > end) return false
      }
      if (row.conditionTimeEnabled) {
        const timeOfDay = String(row.conditionTimeOfDay || '')
        if (!timeOfDay) return false
        const hour = viewerHour
        const matches = timeOfDay === 'MORNING'
          ? hour >= 6 && hour < 12
          : timeOfDay === 'AFTERNOON'
            ? hour >= 12 && hour < 17
            : timeOfDay === 'EVENING'
              ? hour >= 17 && hour < 22
              : timeOfDay === 'NIGHT'
                ? hour >= 22 || hour < 6
                : false
        if (!matches) return false
      }
      if (row.conditionBackgroundEnabled) {
        const backgrounds = Array.isArray(row.conditionBackgrounds) ? row.conditionBackgrounds : []
        if (!backgrounds.length) return false
        if (!zoneBackground || !backgrounds.includes(zoneBackground)) return false
      }
      if (row.conditionCtoonInZoneEnabled) {
        if (!row.conditionCtoonInZoneId) return false
        if (!zoneCtoonIds.has(row.conditionCtoonInZoneId)) return false
      }
      if (row.conditionUserOwnsEnabled) {
        const entries = Array.isArray(row.conditionUserOwns) ? row.conditionUserOwns : []
        if (!entries.length) return false
        for (const entry of entries) {
          const ctoonId = entry?.ctoonId
          const required = Number(entry?.count || 0)
          const owned = userOwnsCountMap.get(ctoonId) || 0
          if (!ctoonId || required < 1 || owned < required) return false
        }
      }
      if (row.conditionUserPointsEnabled) {
        const minPoints = Number(row.conditionUserPointsMin || 0)
        if (minPoints < 1 || userPoints < minPoints) return false
      }
      if (row.conditionUserTotalCountEnabled) {
        const minTotal = Number(row.conditionUserTotalCountMin || 0)
        if (minTotal < 1 || userTotalCount < minTotal) return false
      }
      if (row.conditionUserUniqueCountEnabled) {
        const minUnique = Number(row.conditionUserUniqueCountMin || 0)
        if (minUnique < 1 || userUniqueCount < minUnique) return false
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
