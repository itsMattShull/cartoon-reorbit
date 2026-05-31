import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const CACHE_TTL_SECONDS = 3600 // 1 hour

function parseStartYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

function parseEndYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return isNaN(d.getTime()) ? null : d
}

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']

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

  const { start, end, packId, set, refresh } = getQuery(event)

  let endDate = (typeof end === 'string' && parseEndYMD(end)) || new Date()
  let startDate = (typeof start === 'string' && parseStartYMD(start)) || null

  if (!startDate) {
    const s = new Date(endDate)
    s.setDate(s.getDate() - 29)
    startDate = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0))
  }

  if (startDate > endDate) {
    const tmp = startDate
    startDate = endDate
    endDate = tmp
  }

  const startKey = startDate.toISOString().slice(0, 10)
  const endKey = endDate.toISOString().slice(0, 10)
  const cacheKey = `admin:set-analytics:${startKey}:${endKey}:${packId || 'all'}:${set || 'all'}`

  if (!refresh) {
    try {
      const hit = await redis.get(cacheKey)
      if (hit) return JSON.parse(hit)
    } catch {}
  }

  // If filtering by pack, resolve the ctoon IDs for that pack
  let ctoonIdFilter = undefined
  if (packId && typeof packId === 'string') {
    const opts = await prisma.packCtoonOption.findMany({
      where: { packId },
      select: { ctoonId: true }
    })
    ctoonIdFilter = { in: opts.map(o => o.ctoonId) }
  }

  // Packs opened in the date range
  const packsOpened = await prisma.userPack.count({
    where: {
      opened: true,
      openedAt: { gte: startDate, lte: endDate },
      ...(packId && typeof packId === 'string' ? { packId } : {})
    }
  })

  // Ctoon counts grouped by rarity × source (cmart vs pack vs pe)
  const rarityBreakdown = await Promise.all(
    RARITIES.map(async (rarity) => {
      const ctoonWhere = {
        rarity,
        ...(ctoonIdFilter ? { id: ctoonIdFilter } : {}),
        ...(set && typeof set === 'string' ? { set } : {})
      }

      const dateRange = { gte: startDate, lte: endDate }

      const [cmart, pack, pe] = await Promise.all([
        // inCmart=true, no pack origin (direct cMart purchase or pre-tracking)
        prisma.userCtoon.count({
          where: {
            createdAt: dateRange,
            userPackId: null,
            ctoon: { ...ctoonWhere, inCmart: true }
          }
        }),
        // inCmart=true, came from a pack opening
        prisma.userCtoon.count({
          where: {
            createdAt: dateRange,
            userPackId: { not: null },
            ctoon: { ...ctoonWhere, inCmart: true }
          }
        }),
        // Pack-exclusive (not in cMart)
        prisma.userCtoon.count({
          where: {
            createdAt: dateRange,
            ctoon: { ...ctoonWhere, inCmart: false }
          }
        })
      ])

      return { rarity, cmart, pack, pe, total: cmart + pack + pe }
    })
  )

  // Filter options for dropdowns — sets from ctoons that appear in at least one pack
  const [setsRaw, packs] = await Promise.all([
    prisma.ctoon.findMany({
      where: { set: { not: null }, packOptions: { some: {} } },
      select: { set: true },
      distinct: ['set'],
      orderBy: { set: 'asc' }
    }),
    prisma.pack.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })
  ])

  const result = {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    packsOpened,
    rarityBreakdown,
    sets: setsRaw.map(s => s.set).filter(Boolean),
    packs
  }

  try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS) } catch {}

  return result
})
