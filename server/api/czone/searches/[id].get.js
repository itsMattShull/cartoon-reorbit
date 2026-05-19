import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

// Search structure (prize pool, conditions, background/ctoon metadata) never
// changes mid-event, so all visitors share one DB round-trip per 10 minutes.
const SEARCH_META_TTL = 600    // 10 minutes
const USER_CONDITION_TTL = 300 // 5 minutes — matches searches.get.js
const PRIZE_CAPTURE_TTL = 60   // 1 minute

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const { id } = event.context.params || {}
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing search id' })
  }

  const searchMetaCacheKey = `czone:search-meta:${id}`
  const prizeCacheKey = `czone:search-prizes:${id}:${userId}`
  const userCondCacheKey = `czone:ucond:${userId}`

  // Read all three caches in parallel before touching the DB
  const [searchMetaStr, prizeCachedStr, userCondCachedStr] = await Promise.all([
    redis.get(searchMetaCacheKey).catch(() => null),
    redis.get(prizeCacheKey).catch(() => null),
    redis.get(userCondCacheKey).catch(() => null),
  ])

  // --- Search metadata cache (non-user-specific) ---
  let search = null
  let backgroundMap = new Map()
  let ctoonMap = new Map()
  let searchMetaCacheHit = false

  if (searchMetaStr) {
    try {
      const parsed = JSON.parse(searchMetaStr)
      search = parsed.search
      backgroundMap = new Map(Object.entries(parsed.backgroundMap || {}))
      ctoonMap = new Map(Object.entries(parsed.ctoonMap || {}))
      searchMetaCacheHit = true
    } catch {}
  }

  if (!searchMetaCacheHit) {
    search = await db.cZoneSearch.findUnique({
      where: { id },
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

    if (!search) {
      throw createError({ statusCode: 404, statusMessage: 'cZone Search not found' })
    }

    const backgroundNames = new Set()
    const extraCtoonIds = new Set()

    for (const row of search.prizePool || []) {
      if (row.conditionBackgroundEnabled) {
        const names = Array.isArray(row.conditionBackgrounds) ? row.conditionBackgrounds : []
        for (const name of names) { if (name) backgroundNames.add(name) }
      }
      if (row.conditionCtoonInZoneEnabled && row.conditionCtoonInZoneId) {
        extraCtoonIds.add(row.conditionCtoonInZoneId)
      }
      if (row.conditionUserOwnsEnabled) {
        const entries = Array.isArray(row.conditionUserOwns) ? row.conditionUserOwns : []
        for (const entry of entries) {
          if (entry?.ctoonId) extraCtoonIds.add(entry.ctoonId)
        }
      }
    }

    const [backgrounds, extraCtoons] = await Promise.all([
      backgroundNames.size
        ? db.background.findMany({
            where: { filename: { in: Array.from(backgroundNames) } },
            select: { id: true, filename: true, label: true, imagePath: true }
          })
        : [],
      extraCtoonIds.size
        ? db.ctoon.findMany({
            where: { id: { in: Array.from(extraCtoonIds) } },
            select: { id: true, name: true, rarity: true, assetPath: true }
          })
        : [],
    ])

    backgroundMap = new Map(backgrounds.map(bg => [bg.filename, bg]))
    ctoonMap = new Map(extraCtoons.map(ctoon => [ctoon.id, ctoon]))

    // Cache the non-user-specific search structure for 10 minutes
    try {
      await redis.setex(searchMetaCacheKey, SEARCH_META_TTL, JSON.stringify({
        search,
        backgroundMap: Object.fromEntries(backgroundMap),
        ctoonMap: Object.fromEntries(ctoonMap),
      }))
    } catch {}
  }

  if (!search) {
    throw createError({ statusCode: 404, statusMessage: 'cZone Search not found' })
  }

  // --- Parse prize/capture cache (per-user) ---
  let ownershipMap = new Map()
  let captureMap = new Map()
  let prizeCacheHit = false
  if (prizeCachedStr) {
    try {
      const parsed = JSON.parse(prizeCachedStr)
      ownershipMap = new Map(Object.entries(parsed.ownershipMap || {}))
      captureMap = new Map(Object.entries(parsed.captureMap || {}))
      prizeCacheHit = true
    } catch {}
  }

  // --- Parse user condition cache ---
  let cachedCondData = null
  let userCondCacheHit = false
  if (userCondCachedStr) {
    try {
      cachedCondData = JSON.parse(userCondCachedStr)
      userCondCacheHit = true
    } catch {}
  }

  // Collect IDs needed for user-specific queries from the prize pool
  const prizeCtoonIds = (search.prizePool || []).map(row => row.ctoonId)
  const conditionOwnsCtoonIds = new Set()
  const lessThanCtoonIds = new Set()
  const setUniqueNames = new Set()
  const setTotalNames = new Set()

  for (const row of search.prizePool || []) {
    if (row.conditionUserOwnsEnabled) {
      const entries = Array.isArray(row.conditionUserOwns) ? row.conditionUserOwns : []
      for (const entry of entries) {
        if (entry?.ctoonId) conditionOwnsCtoonIds.add(entry.ctoonId)
      }
    }
    if (row.conditionOwnsLessThanEnabled && row.ctoonId) {
      lessThanCtoonIds.add(row.ctoonId)
    }
    if (row.conditionSetUniqueCountEnabled && row.conditionSetUniqueCountSet) {
      setUniqueNames.add(row.conditionSetUniqueCountSet)
    }
    if (row.conditionSetTotalCountEnabled && row.conditionSetTotalCountSet) {
      setTotalNames.add(row.conditionSetTotalCountSet)
    }
  }

  // Run all DB queries that aren't satisfied by cache in one parallel batch
  const [
    ownershipRows,
    captureRows,
    pointsRow,
    userTotalCountResult,
    uniqueRows,
    conditionOwnsRows,
    lessThanRows,
  ] = await Promise.all([
    !prizeCacheHit && prizeCtoonIds.length
      ? db.userCtoon.groupBy({
          by: ['ctoonId'],
          where: { userId, burnedAt: null, ctoonId: { in: prizeCtoonIds } },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    !prizeCacheHit
      ? db.cZoneSearchCapture.groupBy({
          by: ['ctoonId'],
          where: { userId, cZoneSearchId: id },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    !userCondCacheHit
      ? db.userPoints.findUnique({ where: { userId }, select: { points: true } })
      : Promise.resolve(null),
    !userCondCacheHit
      ? db.userCtoon.count({ where: { userId, burnedAt: null } })
      : Promise.resolve(null),
    !userCondCacheHit
      ? db.userCtoon.groupBy({ by: ['ctoonId'], where: { userId, burnedAt: null } })
      : Promise.resolve(null),
    !userCondCacheHit && conditionOwnsCtoonIds.size
      ? db.userCtoon.groupBy({
          by: ['ctoonId'],
          where: { userId, burnedAt: null, ctoonId: { in: Array.from(conditionOwnsCtoonIds) } },
          _count: { _all: true }
        })
      : Promise.resolve([]),
    !userCondCacheHit && lessThanCtoonIds.size
      ? db.userCtoon.groupBy({
          by: ['ctoonId'],
          where: { userId, burnedAt: null, ctoonId: { in: Array.from(lessThanCtoonIds) } },
          _count: { _all: true }
        })
      : Promise.resolve([]),
  ])

  // --- Populate and persist prize/capture data ---
  if (!prizeCacheHit) {
    ownershipMap = new Map(ownershipRows.map(r => [r.ctoonId, r._count._all || 0]))
    captureMap = new Map(captureRows.map(r => [r.ctoonId, r._count._all || 0]))
    try {
      await redis.setex(prizeCacheKey, PRIZE_CAPTURE_TTL, JSON.stringify({
        ownershipMap: Object.fromEntries(ownershipMap),
        captureMap: Object.fromEntries(captureMap),
      }))
    } catch {}
  }

  // --- Populate and persist user stats data ---
  let userPoints = 0
  let userTotalCount = 0
  let userUniqueCount = 0
  let conditionOwnsMap = {}
  let userOwnsLessThanCountMap = {}
  let userSetUniqueCountMap = {}
  let userSetTotalCountMap = {}

  if (!userCondCacheHit) {
    userPoints = Number(pointsRow?.points || 0)
    userTotalCount = userTotalCountResult
    userUniqueCount = uniqueRows.length
    conditionOwnsMap = Object.fromEntries(conditionOwnsRows.map(r => [r.ctoonId, r._count._all || 0]))
    userOwnsLessThanCountMap = Object.fromEntries(lessThanRows.map(r => [r.ctoonId, r._count._all || 0]))

    // Resolve set counts if needed
    if (setUniqueNames.size || setTotalNames.size) {
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

      const allSetCtoonIds = new Set()
      if (uniqueSetGrouped) for (const r of uniqueSetGrouped) allSetCtoonIds.add(r.ctoonId)
      if (totalSetGrouped) for (const r of totalSetGrouped) allSetCtoonIds.add(r.ctoonId)

      const setCtoons = allSetCtoonIds.size
        ? await db.ctoon.findMany({
            where: { id: { in: Array.from(allSetCtoonIds) } },
            select: { id: true, set: true }
          })
        : []
      const setById = new Map(setCtoons.map(c => [c.id, c.set]))

      if (uniqueSetGrouped) {
        for (const row of uniqueSetGrouped) {
          const setName = setById.get(row.ctoonId)
          if (setName) userSetUniqueCountMap[setName] = (userSetUniqueCountMap[setName] || 0) + 1
        }
      }
      if (totalSetGrouped) {
        for (const row of totalSetGrouped) {
          const setName = setById.get(row.ctoonId)
          if (setName) userSetTotalCountMap[setName] = (userSetTotalCountMap[setName] || 0) + (row._count._all || 0)
        }
      }
    }

    // Write complete data to the shared user condition cache so that
    // searches.get.js can rely on userOwnsLessThanCountMap being accurate.
    try {
      await redis.setex(userCondCacheKey, USER_CONDITION_TTL, JSON.stringify({
        userPoints,
        userTotalCount,
        userUniqueCount,
        userOwnsCountMap: conditionOwnsMap,
        userOwnsLessThanCountMap,
        userSetUniqueCountMap,
        userSetTotalCountMap,
      }))
    } catch {}
  } else {
    // Cache hit — extract stats
    userPoints = cachedCondData.userPoints || 0
    userTotalCount = cachedCondData.userTotalCount || 0
    userUniqueCount = cachedCondData.userUniqueCount || 0
    userOwnsLessThanCountMap = cachedCondData.userOwnsLessThanCountMap || {}

    // Start with cached ownership entries; fill in any IDs this page needs that
    // weren't in the cache (do NOT rewrite the cache with page-specific data)
    conditionOwnsMap = { ...(cachedCondData.userOwnsCountMap || {}) }
    if (conditionOwnsCtoonIds.size) {
      const missingIds = Array.from(conditionOwnsCtoonIds).filter(cid => !(cid in conditionOwnsMap))
      if (missingIds.length) {
        try {
          const missingRows = await db.userCtoon.groupBy({
            by: ['ctoonId'],
            where: { userId, burnedAt: null, ctoonId: { in: missingIds } },
            _count: { _all: true }
          })
          for (const row of missingRows) {
            conditionOwnsMap[row.ctoonId] = row._count._all || 0
          }
          for (const cid of missingIds) {
            if (!(cid in conditionOwnsMap)) conditionOwnsMap[cid] = 0
          }
        } catch {}
      }
    }

    // Fill in set counts for any set names this search needs that weren't in the
    // shared cache (cache may have been written by a different search with no set conditions)
    userSetUniqueCountMap = { ...(cachedCondData.userSetUniqueCountMap || {}) }
    userSetTotalCountMap = { ...(cachedCondData.userSetTotalCountMap || {}) }
    const missingUniqueSetNames = Array.from(setUniqueNames).filter(n => !(n in userSetUniqueCountMap))
    const missingTotalSetNames = Array.from(setTotalNames).filter(n => !(n in userSetTotalCountMap))
    if (missingUniqueSetNames.length || missingTotalSetNames.length) {
      try {
        const [uniqueSetGrouped, totalSetGrouped] = await Promise.all([
          missingUniqueSetNames.length
            ? db.userCtoon.groupBy({
                by: ['ctoonId'],
                where: { userId, burnedAt: null, ctoon: { set: { in: missingUniqueSetNames } } }
              })
            : null,
          missingTotalSetNames.length
            ? db.userCtoon.groupBy({
                by: ['ctoonId'],
                where: { userId, burnedAt: null, ctoon: { set: { in: missingTotalSetNames } } },
                _count: { _all: true }
              })
            : null,
        ])
        const allSetCtoonIds = new Set()
        if (uniqueSetGrouped) for (const r of uniqueSetGrouped) allSetCtoonIds.add(r.ctoonId)
        if (totalSetGrouped) for (const r of totalSetGrouped) allSetCtoonIds.add(r.ctoonId)
        if (allSetCtoonIds.size) {
          const setCtoons = await db.ctoon.findMany({
            where: { id: { in: Array.from(allSetCtoonIds) } },
            select: { id: true, set: true }
          })
          const setById = new Map(setCtoons.map(c => [c.id, c.set]))
          if (uniqueSetGrouped) {
            for (const row of uniqueSetGrouped) {
              const setName = setById.get(row.ctoonId)
              if (setName) userSetUniqueCountMap[setName] = (userSetUniqueCountMap[setName] || 0) + 1
            }
          }
          if (totalSetGrouped) {
            for (const row of totalSetGrouped) {
              const setName = setById.get(row.ctoonId)
              if (setName) userSetTotalCountMap[setName] = (userSetTotalCountMap[setName] || 0) + (row._count._all || 0)
            }
          }
        }
        for (const name of missingUniqueSetNames) {
          if (!(name in userSetUniqueCountMap)) userSetUniqueCountMap[name] = 0
        }
        for (const name of missingTotalSetNames) {
          if (!(name in userSetTotalCountMap)) userSetTotalCountMap[name] = 0
        }
      } catch {}
    }
  }

  const startAt = search.startAt instanceof Date ? search.startAt.toISOString() : search.startAt
  const endAt = search.endAt instanceof Date ? search.endAt.toISOString() : search.endAt

  return {
    id: search.id,
    name: search.name,
    startAt,
    endAt,
    appearanceRatePercent: search.appearanceRatePercent,
    cooldownHours: search.cooldownHours,
    resetType: search.resetType,
    dailyCollectLimit: search.dailyCollectLimit,
    collectionType: search.collectionType,
    userStats: {
      userPoints: Number(userPoints),
      userTotalCount,
      userUniqueCount,
      userOwnsCountMap: conditionOwnsMap,
      userSetUniqueCountMap,
      userSetTotalCountMap,
    },
    prizePool: (search.prizePool || []).map((row) => {
      const backgroundList = row.conditionBackgroundEnabled
        ? (Array.isArray(row.conditionBackgrounds) ? row.conditionBackgrounds : [])
            .map((filename) => backgroundMap.get(filename) || { filename, label: filename, imagePath: null })
        : []
      const ownsEntries = row.conditionUserOwnsEnabled
        ? (Array.isArray(row.conditionUserOwns) ? row.conditionUserOwns : []).map((entry) => ({
            ctoonId: entry?.ctoonId || '',
            count: Number(entry?.count || 0),
            ctoon: entry?.ctoonId ? ctoonMap.get(entry.ctoonId) || null : null
          }))
        : []

      return {
        id: row.id,
        ctoon: row.ctoon,
        chancePercent: row.chancePercent,
        maxCaptures: row.maxCaptures,
        userOwnedCount: ownershipMap.get(row.ctoonId) || 0,
        userCaptureCount: captureMap.get(row.ctoonId) || 0,
        conditionDateEnabled: row.conditionDateEnabled,
        conditionDateStart: row.conditionDateStart,
        conditionDateEnd: row.conditionDateEnd,
        conditionTimeEnabled: row.conditionTimeEnabled,
        conditionTimeOfDay: row.conditionTimeOfDay,
        conditionBackgroundEnabled: row.conditionBackgroundEnabled,
        conditionBackgrounds: Array.isArray(row.conditionBackgrounds) ? row.conditionBackgrounds : [],
        conditionBackgroundDetails: backgroundList,
        conditionCtoonInZoneEnabled: row.conditionCtoonInZoneEnabled,
        conditionCtoonInZoneId: row.conditionCtoonInZoneId,
        conditionCtoonInZone: row.conditionCtoonInZoneId ? ctoonMap.get(row.conditionCtoonInZoneId) || null : null,
        conditionUserOwnsEnabled: row.conditionUserOwnsEnabled,
        conditionUserOwns: ownsEntries,
        conditionUserPointsEnabled: row.conditionUserPointsEnabled,
        conditionUserPointsMin: row.conditionUserPointsMin,
        conditionUserTotalCountEnabled: row.conditionUserTotalCountEnabled,
        conditionUserTotalCountMin: row.conditionUserTotalCountMin,
        conditionUserUniqueCountEnabled: row.conditionUserUniqueCountEnabled,
        conditionUserUniqueCountMin: row.conditionUserUniqueCountMin,
        conditionSetUniqueCountEnabled: row.conditionSetUniqueCountEnabled,
        conditionSetUniqueCountMin: row.conditionSetUniqueCountMin,
        conditionSetUniqueCountSet: row.conditionSetUniqueCountSet,
        conditionSetTotalCountEnabled: row.conditionSetTotalCountEnabled,
        conditionSetTotalCountMin: row.conditionSetTotalCountMin,
        conditionSetTotalCountSet: row.conditionSetTotalCountSet,
        conditionOwnsLessThanEnabled: row.conditionOwnsLessThanEnabled,
        conditionOwnsLessThanCount: row.conditionOwnsLessThanCount
      }
    })
  }
})
