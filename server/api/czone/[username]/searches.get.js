import { defineEventHandler, createError, getQuery } from 'h3'
import { DateTime } from 'luxon'
import { prisma as db } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

// Cache active searches + prize pool for 30 minutes.  The prize pool for a
// given search never changes mid-event, so all concurrent visitors share one
// DB round-trip per 30 minutes instead of each firing their own query.
const ACTIVE_SEARCHES_TTL = 1_800_000 // 30 minutes
let _searchesCache = null
let _searchesCacheExpiry = 0
let _searchesFetch = null

async function getActiveSearches() {
  const now = Date.now()
  if (_searchesCache && now < _searchesCacheExpiry) return _searchesCache
  // Coalesce concurrent cache-miss requests onto one in-flight DB query
  if (_searchesFetch) return _searchesFetch
  _searchesFetch = db.cZoneSearch.findMany({
    where: { startAt: { lte: new Date() }, endAt: { gte: new Date() } },
    orderBy: { endAt: 'asc' },
    include: {
      prizePool: {
        include: {
          ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
        }
      }
    }
  }).then(rows => {
    _searchesCache = rows
    _searchesCacheExpiry = Date.now() + ACTIVE_SEARCHES_TTL
    _searchesFetch = null
    return rows
  }).catch(err => {
    _searchesFetch = null
    throw err
  })
  return _searchesFetch
}

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

// Per-user inventory data cached in Redis for 5 minutes.
// Counts rarely change and are safe to serve slightly stale.
const USER_CONDITION_TTL = 300 // seconds

async function getUserConditionData(userId, searches) {
  const cacheKey = `czone:ucond:${userId}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  const needsUserPoints  = searches.some(s => s.prizePool.some(p => p.conditionUserPointsEnabled))
  const needsUserTotal   = searches.some(s => s.prizePool.some(p => p.conditionUserTotalCountEnabled))
  const needsUserUnique  = searches.some(s => s.prizePool.some(p => p.conditionUserUniqueCountEnabled))
  const needsSetUnique   = searches.some(s => s.prizePool.some(p => p.conditionSetUniqueCountEnabled))
  const needsSetTotal    = searches.some(s => s.prizePool.some(p => p.conditionSetTotalCountEnabled))
  const needsUserOwns    = searches.some(s => s.prizePool.some(p => p.conditionUserOwnsEnabled))
  const needsOwnsLessThan = searches.some(s => s.prizePool.some(p => p.conditionOwnsLessThanEnabled))

  // Collect set names and ctoon IDs needed for condition checks
  const setUniqueNames = new Set()
  const setTotalNames  = new Set()
  const ownsIds        = new Set()
  const lessThanIds    = new Set()
  for (const search of searches) {
    for (const row of search.prizePool) {
      if (needsSetUnique && row.conditionSetUniqueCountEnabled && row.conditionSetUniqueCountSet)
        setUniqueNames.add(row.conditionSetUniqueCountSet)
      if (needsSetTotal && row.conditionSetTotalCountEnabled && row.conditionSetTotalCountSet)
        setTotalNames.add(row.conditionSetTotalCountSet)
      if (needsUserOwns && row.conditionUserOwnsEnabled) {
        const entries = Array.isArray(row.conditionUserOwns) ? row.conditionUserOwns : []
        for (const e of entries) { if (e?.ctoonId) ownsIds.add(e.ctoonId) }
      }
      if (needsOwnsLessThan && row.conditionOwnsLessThanEnabled && row.ctoonId)
        lessThanIds.add(row.ctoonId)
    }
  }

  // Run all independent inventory queries in parallel
  const [
    pointsRow,
    userTotalCount,
    uniqueRows,
    userOwnsRows,
    lessThanRows,
  ] = await Promise.all([
    needsUserPoints
      ? db.userPoints.findUnique({ where: { userId }, select: { points: true } })
      : null,
    needsUserTotal
      ? db.userCtoon.count({ where: { userId, burnedAt: null } })
      : null,
    needsUserUnique
      ? db.userCtoon.groupBy({ by: ['ctoonId'], where: { userId, burnedAt: null } })
      : null,
    (needsUserOwns && ownsIds.size)
      ? db.userCtoon.groupBy({
          by: ['ctoonId'],
          where: { userId, burnedAt: null, ctoonId: { in: Array.from(ownsIds) } },
          _count: { _all: true }
        })
      : null,
    (needsOwnsLessThan && lessThanIds.size)
      ? db.userCtoon.groupBy({
          by: ['ctoonId'],
          where: { userId, burnedAt: null, ctoonId: { in: Array.from(lessThanIds) } },
          _count: { _all: true }
        })
      : null,
  ])

  const userPoints         = Number(pointsRow?.points || 0)
  const userTotalCountVal  = userTotalCount ?? 0
  const userUniqueCount    = uniqueRows ? uniqueRows.length : 0

  const userOwnsCountMap = new Map()
  if (userOwnsRows) {
    for (const row of userOwnsRows)
      userOwnsCountMap.set(row.ctoonId, row._count._all || 0)
  }

  const userOwnsLessThanCountMap = new Map()
  if (lessThanRows) {
    for (const row of lessThanRows)
      userOwnsLessThanCountMap.set(row.ctoonId, row._count._all || 0)
  }

  // Set counts: groupBy ctoonId then resolve set names — run both set types in parallel
  const allSetNames = new Set([...setUniqueNames, ...setTotalNames])
  let setCtoonRows = []
  if (allSetNames.size) {
    const [uniqueSetGrouped, totalSetGrouped] = await Promise.all([
      setUniqueNames.size
        ? db.userCtoon.groupBy({
            by: ['ctoonId'],
            where: { userId, burnedAt: null, ctoon: { set: { in: Array.from(setUniqueNames) } } }
          })
        : null,
      setTotalNames.size
        ? db.userCtoon.groupBy({
            by: ['ctoonId'],
            where: { userId, burnedAt: null, ctoon: { set: { in: Array.from(setTotalNames) } } },
            _count: { _all: true }
          })
        : null,
    ])

    // Collect all ctoon IDs we need set names for
    const allCtoonIds = new Set()
    if (uniqueSetGrouped) for (const r of uniqueSetGrouped) allCtoonIds.add(r.ctoonId)
    if (totalSetGrouped)  for (const r of totalSetGrouped)  allCtoonIds.add(r.ctoonId)

    const setCtoons = allCtoonIds.size
      ? await db.ctoon.findMany({ where: { id: { in: Array.from(allCtoonIds) } }, select: { id: true, set: true } })
      : []
    const setById = new Map(setCtoons.map(c => [c.id, c.set]))

    const userSetUniqueCountMap = new Map()
    if (uniqueSetGrouped) {
      for (const row of uniqueSetGrouped) {
        const setName = setById.get(row.ctoonId)
        if (setName) userSetUniqueCountMap.set(setName, (userSetUniqueCountMap.get(setName) || 0) + 1)
      }
    }

    const userSetTotalCountMap = new Map()
    if (totalSetGrouped) {
      for (const row of totalSetGrouped) {
        const setName = setById.get(row.ctoonId)
        if (setName) userSetTotalCountMap.set(setName, (userSetTotalCountMap.get(setName) || 0) + (row._count._all || 0))
      }
    }

    const data = {
      userPoints,
      userTotalCount: userTotalCountVal,
      userUniqueCount,
      userOwnsCountMap: Object.fromEntries(userOwnsCountMap),
      userOwnsLessThanCountMap: Object.fromEntries(userOwnsLessThanCountMap),
      userSetUniqueCountMap: Object.fromEntries(userSetUniqueCountMap),
      userSetTotalCountMap: Object.fromEntries(userSetTotalCountMap),
    }
    try { await redis.setex(cacheKey, USER_CONDITION_TTL, JSON.stringify(data)) } catch {}
    return {
      userPoints,
      userTotalCount: userTotalCountVal,
      userUniqueCount,
      userOwnsCountMap,
      userOwnsLessThanCountMap,
      userSetUniqueCountMap,
      userSetTotalCountMap,
    }
  }

  const data = {
    userPoints,
    userTotalCount: userTotalCountVal,
    userUniqueCount,
    userOwnsCountMap: Object.fromEntries(userOwnsCountMap),
    userOwnsLessThanCountMap: Object.fromEntries(userOwnsLessThanCountMap),
    userSetUniqueCountMap: {},
    userSetTotalCountMap: {},
  }
  try { await redis.setex(cacheKey, USER_CONDITION_TTL, JSON.stringify(data)) } catch {}
  return {
    userPoints,
    userTotalCount: userTotalCountVal,
    userUniqueCount,
    userOwnsCountMap,
    userOwnsLessThanCountMap,
    userSetUniqueCountMap: new Map(),
    userSetTotalCountMap: new Map(),
  }
}

// Restore Maps from plain objects after Redis deserialization
function rehydrateConditionData(data) {
  return {
    ...data,
    userOwnsCountMap:        new Map(Object.entries(data.userOwnsCountMap || {})),
    userOwnsLessThanCountMap: new Map(Object.entries(data.userOwnsLessThanCountMap || {})),
    userSetUniqueCountMap:   new Map(Object.entries(data.userSetUniqueCountMap || {})),
    userSetTotalCountMap:    new Map(Object.entries(data.userSetTotalCountMap || {})),
  }
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

  // Cache zone owner lookup — usernames don't change
  let zoneOwnerId = null
  const ownerCacheKey = `czone:owner:${username}`
  try {
    const cached = await redis.get(ownerCacheKey)
    if (cached) zoneOwnerId = cached
  } catch {}

  if (!zoneOwnerId) {
    const zoneOwner = await db.user.findUnique({ where: { username }, select: { id: true } })
    if (!zoneOwner) throw createError({ statusCode: 404, statusMessage: 'User not found' })
    zoneOwnerId = zoneOwner.id
    try { await redis.setex(ownerCacheKey, 300, zoneOwnerId) } catch {}
  }

  if (zoneOwnerId === userId) return { items: [] }

  // Fetch zone layout + active searches in parallel
  const [zoneRow, searches] = await Promise.all([
    db.cZone.findUnique({ where: { userId: zoneOwnerId }, select: { layoutData: true, background: true } }),
    getActiveSearches(),
  ])

  if (!searches.length) return { items: [] }

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

  const now = new Date()
  const searchIds = searches.map(s => s.id)
  const onceIds   = searches.filter(s => s.collectionType === 'ONCE').map(s => s.id)
  const customIds = searches.filter(s => s.collectionType === 'CUSTOM_PER_CTOON').map(s => s.id)
  const dailyLimitIds = searches
    .filter(s => (s.resetType || 'COOLDOWN_HOURS') === 'DAILY_AT_RESET')
    .filter(s => Number(s.dailyCollectLimit ?? 0) > 0)
    .map(s => s.id)

  let chicagoBoundaryUtc = null
  if (dailyLimitIds.length) {
    const chicagoNow = DateTime.now().setZone('America/Chicago')
    let boundaryLocal = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
    if (chicagoNow < boundaryLocal) boundaryLocal = boundaryLocal.minus({ days: 1 })
    chicagoBoundaryUtc = boundaryLocal.toUTC().toJSDate()
  }

  // Run all independent per-user queries in parallel
  const [
    zoneToons,
    conditionData,
    lastAppearances,
    capturedRows,
    dailyCaptureCounts,
    customCaptureCounts,
  ] = await Promise.all([
    zoneToonIds.length
      ? db.userCtoon.findMany({ where: { id: { in: zoneToonIds } }, select: { ctoonId: true } })
      : [],
    getUserConditionData(userId, searches),
    db.cZoneSearchAppearance.groupBy({
      by: ['cZoneSearchId'],
      where: { userId, cZoneSearchId: { in: searchIds } },
      _max: { createdAt: true }
    }),
    onceIds.length
      ? db.cZoneSearchCapture.findMany({
          where: { userId, cZoneSearchId: { in: onceIds } },
          select: { cZoneSearchId: true, ctoonId: true }
        })
      : [],
    dailyLimitIds.length
      ? db.cZoneSearchCapture.groupBy({
          by: ['cZoneSearchId'],
          where: { userId, cZoneSearchId: { in: dailyLimitIds }, createdAt: { gte: chicagoBoundaryUtc } },
          _count: { _all: true }
        })
      : [],
    customIds.length
      ? db.cZoneSearchCapture.groupBy({
          by: ['cZoneSearchId', 'ctoonId'],
          where: { userId, cZoneSearchId: { in: customIds } },
          _count: { _all: true }
        })
      : [],
  ])

  // Rehydrate Maps if data came from Redis (plain objects)
  const {
    userPoints,
    userTotalCount,
    userUniqueCount,
    userOwnsCountMap,
    userOwnsLessThanCountMap,
    userSetUniqueCountMap,
    userSetTotalCountMap,
  } = (conditionData.userOwnsCountMap instanceof Map)
    ? conditionData
    : rehydrateConditionData(conditionData)

  const zoneCtoonIds = new Set(zoneToons.map(row => row.ctoonId))

  const lastMap = new Map()
  for (const row of lastAppearances)
    lastMap.set(row.cZoneSearchId, row._max.createdAt)

  const capturedMap = new Map()
  for (const row of capturedRows) {
    if (!capturedMap.has(row.cZoneSearchId)) capturedMap.set(row.cZoneSearchId, new Set())
    capturedMap.get(row.cZoneSearchId).add(row.ctoonId)
  }

  const dailyCaptureMap = new Map()
  for (const row of dailyCaptureCounts)
    dailyCaptureMap.set(row.cZoneSearchId, row._count._all || 0)

  const customCaptureMap = new Map()
  for (const row of customCaptureCounts) {
    if (!customCaptureMap.has(row.cZoneSearchId)) customCaptureMap.set(row.cZoneSearchId, new Map())
    customCaptureMap.get(row.cZoneSearchId).set(row.ctoonId, row._count._all || 0)
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
        const end   = String(row.conditionDateEnd   || '')
        if (!start || !end) return false
        if (viewerDate < start || viewerDate > end) return false
      }
      if (row.conditionTimeEnabled) {
        const timeOfDay = String(row.conditionTimeOfDay || '')
        if (!timeOfDay) return false
        const hour = viewerHour
        const matches = timeOfDay === 'MORNING'
          ? hour >= 6  && hour < 12
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
        const zoneBgFile = (zoneBackground || '').split('/').pop()
        if (!zoneBgFile || !backgrounds.some(b => (b || '').split('/').pop() === zoneBgFile)) return false
      }
      if (row.conditionCtoonInZoneEnabled) {
        if (!row.conditionCtoonInZoneId) return false
        if (!zoneCtoonIds.has(row.conditionCtoonInZoneId)) return false
      }
      if (row.conditionUserOwnsEnabled) {
        const entries = Array.isArray(row.conditionUserOwns) ? row.conditionUserOwns : []
        if (!entries.length) return false
        for (const entry of entries) {
          const ctoonId  = entry?.ctoonId
          const required = Number(entry?.count || 0)
          const owned    = userOwnsCountMap.get(ctoonId) || 0
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
      if (row.conditionSetUniqueCountEnabled) {
        const minSetUnique = Number(row.conditionSetUniqueCountMin || 0)
        const setName      = String(row.conditionSetUniqueCountSet || '')
        if (minSetUnique < 1 || !setName) return false
        const ownedUniqueInSet = userSetUniqueCountMap.get(setName) || 0
        if (ownedUniqueInSet < minSetUnique) return false
      }
      if (row.conditionSetTotalCountEnabled) {
        const minSetTotal = Number(row.conditionSetTotalCountMin || 0)
        const setName     = String(row.conditionSetTotalCountSet || '')
        if (minSetTotal < 1 || !setName) return false
        const ownedTotalInSet = userSetTotalCountMap.get(setName) || 0
        if (ownedTotalInSet < minSetTotal) return false
      }
      if (row.conditionOwnsLessThanEnabled) {
        const lessThanCount = Number(row.conditionOwnsLessThanCount || 0)
        if (lessThanCount < 1) return false
        const owned = userOwnsLessThanCountMap.get(row.ctoonId) || 0
        if (owned >= lessThanCount) return false
      }
      return clampPercent(row.chancePercent) > 0
    })

    const chosen = pickWeighted(eligiblePool)
    if (!chosen) continue

    const appearance = await db.cZoneSearchAppearance.create({
      data: {
        cZoneSearchId: search.id,
        userId,
        ctoonId:     chosen.ctoonId,
        zoneOwnerId: zoneOwnerId
      }
    })

    items.push({
      appearanceId:  appearance.id,
      cZoneSearchId: search.id,
      ctoon: {
        id:        chosen.ctoon.id,
        name:      chosen.ctoon.name,
        rarity:    chosen.ctoon.rarity,
        assetPath: chosen.ctoon.assetPath
      }
    })
  }

  return { items }
})
