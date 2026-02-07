import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
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
    return { ctoonId, chancePercent, maxCaptures }
  })

  if (!entries.some(e => e.chancePercent > 0)) {
    throw createError({ statusCode: 400, statusMessage: 'At least one prize pool cToon must have a chance above 0%' })
  }

  const created = await db.cZoneSearch.create({
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

  return created
})
