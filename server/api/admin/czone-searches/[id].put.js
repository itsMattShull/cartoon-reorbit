import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma as db } from '@/server/prisma'

function parsePercent(value, label) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label} (0–100)` })
  }
  return num
}

function parseDate(value, label) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}` })
  }
  return date
}

function parseCooldownHours(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cooldown hours (0 or higher)' })
  }
  return num
}

function parseMaxCaptures(value) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid max captures (positive whole number or blank)' })
  }
  return num
}

function parseDateString(value, label) {
  const str = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label} (YYYY-MM-DD)` })
  }
  return str
}

function parseTimeOfDay(value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'].includes(normalized)) return normalized
  throw createError({ statusCode: 400, statusMessage: 'Invalid time of day' })
}

function parsePositiveInt(value, label) {
  const num = Number(value)
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label} (must be 1 or higher)` })
  }
  return num
}

function parseStringList(value, label) {
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label} list` })
  }
  const list = value.map(v => String(v || '').trim()).filter(Boolean)
  return list
}

function parseUserOwns(value) {
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid user owns cToon list' })
  }
  const rows = value.map((row) => ({
    ctoonId: String(row?.ctoonId || '').trim(),
    count: parsePositiveInt(row?.count, 'user owns count')
  }))
  if (rows.some(r => !r.ctoonId)) {
    throw createError({ statusCode: 400, statusMessage: 'User owns entries require a cToon' })
  }
  return rows
}

function parseResetType(value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (!normalized) return 'COOLDOWN_HOURS'
  if (normalized === 'COOLDOWN_HOURS' || normalized === 'DAILY_AT_RESET') return normalized
  throw createError({ statusCode: 400, statusMessage: 'Invalid reset type' })
}

function parseDailyCollectLimit(value) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid daily collect limit (positive whole number or blank)' })
  }
  return num
}

function normalizeConditions(row, window) {
  const dateEnabled = Boolean(row?.conditionDateEnabled)
  let dateStart = null
  let dateEnd = null
  if (dateEnabled) {
    dateStart = parseDateString(row?.conditionDateStart, 'condition start date')
    dateEnd = parseDateString(row?.conditionDateEnd, 'condition end date')
    if (dateStart > dateEnd) {
      throw createError({ statusCode: 400, statusMessage: 'Condition start date must be on/before end date' })
    }
    if (dateStart < window.start || dateEnd > window.end) {
      throw createError({ statusCode: 400, statusMessage: 'Condition dates must fit within the search window' })
    }
  }

  const timeEnabled = Boolean(row?.conditionTimeEnabled)
  const timeOfDay = timeEnabled ? parseTimeOfDay(row?.conditionTimeOfDay) : null

  const backgroundEnabled = Boolean(row?.conditionBackgroundEnabled)
  const backgrounds = backgroundEnabled ? parseStringList(row?.conditionBackgrounds, 'background') : []
  if (backgroundEnabled && !backgrounds.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one background is required when enabled' })
  }

  const ctoonInZoneEnabled = Boolean(row?.conditionCtoonInZoneEnabled)
  const ctoonInZoneId = ctoonInZoneEnabled ? String(row?.conditionCtoonInZoneId || '').trim() : null
  if (ctoonInZoneEnabled && !ctoonInZoneId) {
    throw createError({ statusCode: 400, statusMessage: 'cToon in cZone is required when enabled' })
  }

  const userOwnsEnabled = Boolean(row?.conditionUserOwnsEnabled)
  const userOwns = userOwnsEnabled ? parseUserOwns(row?.conditionUserOwns) : null
  if (userOwnsEnabled && (!userOwns || !userOwns.length)) {
    throw createError({ statusCode: 400, statusMessage: 'User owns requires at least one cToon' })
  }

  const userPointsEnabled = Boolean(row?.conditionUserPointsEnabled)
  const userPointsMin = userPointsEnabled ? parsePositiveInt(row?.conditionUserPointsMin, 'user points') : null

  const userTotalEnabled = Boolean(row?.conditionUserTotalCountEnabled)
  const userTotalMin = userTotalEnabled ? parsePositiveInt(row?.conditionUserTotalCountMin, 'user total cToon count') : null

  const userUniqueEnabled = Boolean(row?.conditionUserUniqueCountEnabled)
  const userUniqueMin = userUniqueEnabled ? parsePositiveInt(row?.conditionUserUniqueCountMin, 'user unique cToon count') : null

  return {
    conditionDateEnabled: dateEnabled,
    conditionDateStart: dateStart,
    conditionDateEnd: dateEnd,
    conditionTimeEnabled: timeEnabled,
    conditionTimeOfDay: timeOfDay,
    conditionBackgroundEnabled: backgroundEnabled,
    conditionBackgrounds: backgrounds,
    conditionCtoonInZoneEnabled: ctoonInZoneEnabled,
    conditionCtoonInZoneId: ctoonInZoneId,
    conditionUserOwnsEnabled: userOwnsEnabled,
    conditionUserOwns: userOwns,
    conditionUserPointsEnabled: userPointsEnabled,
    conditionUserPointsMin: userPointsMin,
    conditionUserTotalCountEnabled: userTotalEnabled,
    conditionUserTotalCountMin: userTotalMin,
    conditionUserUniqueCountEnabled: userUniqueEnabled,
    conditionUserUniqueCountMin: userUniqueMin
  }
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

  const { id } = event.context.params
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing search id' })

  const existing = await db.cZoneSearch.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'cZone Search not found' })

  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Search name is required' })
  }
  const startAt = parseDate(body?.startAt, 'start date/time')
  const endAt = parseDate(body?.endAt, 'end date/time')
  if (endAt <= startAt) {
    throw createError({ statusCode: 400, statusMessage: 'End date/time must be after start date/time' })
  }
  const windowDates = {
    start: DateTime.fromJSDate(startAt).setZone('America/Chicago').toISODate(),
    end: DateTime.fromJSDate(endAt).setZone('America/Chicago').toISODate()
  }

  const appearanceRatePercent = parsePercent(body?.appearanceRatePercent, 'appearance rate percent')
  const resetType = parseResetType(body?.resetType)
  const cooldownHours = resetType === 'COOLDOWN_HOURS' ? parseCooldownHours(body?.cooldownHours) : 0
  const dailyCollectLimit = resetType === 'DAILY_AT_RESET' ? parseDailyCollectLimit(body?.dailyCollectLimit) : null

  const collectionType = body?.collectionType
  if (collectionType !== 'ONCE' && collectionType !== 'MULTIPLE' && collectionType !== 'CUSTOM_PER_CTOON') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid collection type' })
  }
  const isCustom = collectionType === 'CUSTOM_PER_CTOON'

  const pool = Array.isArray(body?.prizePool) ? body.prizePool : []
  if (!pool.length) {
    throw createError({ statusCode: 400, statusMessage: 'Prize pool must include at least 1 cToon' })
  }

  const seen = new Set()
  const entries = pool.map((row) => {
    const ctoonId = String(row?.ctoonId || '').trim()
    if (!ctoonId) {
      throw createError({ statusCode: 400, statusMessage: 'Prize pool entries require a cToon' })
    }
    if (seen.has(ctoonId)) {
      throw createError({ statusCode: 400, statusMessage: 'Duplicate cToons in prize pool' })
    }
    seen.add(ctoonId)
    const chancePercent = parsePercent(row?.chancePercent, 'cToon chance percent')
    const maxCaptures = isCustom ? parseMaxCaptures(row?.maxCaptures) : null
    const conditions = normalizeConditions(row, windowDates)
    return { ctoonId, chancePercent, maxCaptures, ...conditions }
  })

  if (!entries.some(e => e.chancePercent > 0)) {
    throw createError({ statusCode: 400, statusMessage: 'At least one prize pool cToon must have a chance above 0%' })
  }

  const updated = await db.cZoneSearch.update({
    where: { id },
    data: {
      name,
      startAt,
      endAt,
      appearanceRatePercent,
      cooldownHours,
      resetType,
      dailyCollectLimit,
      collectionType,
      prizePool: {
        deleteMany: {},
        create: entries
      }
    },
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

  return updated
})
