import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const { id } = event.context.params || {}
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing search id' })
  }

  const search = await db.cZoneSearch.findUnique({
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
      for (const name of names) {
        if (name) backgroundNames.add(name)
      }
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
      : Promise.resolve([]),
    extraCtoonIds.size
      ? db.ctoon.findMany({
        where: { id: { in: Array.from(extraCtoonIds) } },
        select: { id: true, name: true, rarity: true, assetPath: true }
      })
      : Promise.resolve([])
  ])

  const backgroundMap = new Map(backgrounds.map(bg => [bg.filename, bg]))
  const ctoonMap = new Map(extraCtoons.map(ctoon => [ctoon.id, ctoon]))

  return {
    id: search.id,
    name: search.name,
    startAt: search.startAt.toISOString(),
    endAt: search.endAt.toISOString(),
    appearanceRatePercent: search.appearanceRatePercent,
    cooldownHours: search.cooldownHours,
    resetType: search.resetType,
    dailyCollectLimit: search.dailyCollectLimit,
    collectionType: search.collectionType,
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
