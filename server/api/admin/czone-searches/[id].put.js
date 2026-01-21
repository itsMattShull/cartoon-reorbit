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

  const appearanceRatePercent = parsePercent(body?.appearanceRatePercent, 'appearance rate percent')
  const cooldownHours = parseCooldownHours(body?.cooldownHours)

  const collectionType = body?.collectionType
  if (collectionType !== 'ONCE' && collectionType !== 'MULTIPLE') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid collection type' })
  }

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
    return { ctoonId, chancePercent }
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
