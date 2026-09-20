// server/api/admin/user-mints.get.js
//
// "Check User Mints" — for each username, how many cToons they minted (i.e.
// originated a new copy of, as opposed to received via trade/auction/admin
// action) in a date range, restricted to usernames whose count falls between
// 1 and an admin-chosen ceiling. Used to spot small-scale suspicious accounts,
// not to rank top collectors.
//
// Deliberately reads CtoonOwnerLog, not UserCtoon. UserCtoon.userId is the
// CURRENT owner and is mutated in place on every trade/auction/admin transfer
// (see server/workers/transfer.worker.js, server/socket-server.js and
// server/api/trade/offers/[id]/accept.post.js), so grouping UserCtoon by
// userId + createdAt would count "who currently holds a copy minted in this
// window", not "who minted it". CtoonOwnerLog gets a fresh row per ownership
// event with the method that produced it, so filtering out the known
// transfer/administrative methods leaves only true mint origination events.
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { getSystemUserIds } from '@/server/utils/systemAccounts'

const CACHE_TTL_SECONDS = 3600
const MAX_RANGE_DAYS = 366
const MAX_RESULT_ROWS = 500

// Every non-mint CtoonOwnerLog method in the codebase today (see
// server/workers/transfer.worker.js, dissolve.worker.js, socket-server.js,
// server/api/trade/offers/[id]/accept.post.js, wishlist accept, and the
// admin cheating tools). A new mint source added later needs no change here —
// only new transfer/admin methods do, and those are rare and reviewed.
const NON_MINT_METHODS = [
  'TRADE',
  'AUCTION',
  'ADMIN_TRANSFER',
  'DISSOLVE',
  'DISSOLVE_INACTIVE',
  'ADMIN_CORRECTION',
  'ADMIN_GRANT',
  'CHEATING_REVOKE_AUCTION'
]

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']

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

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const { start, end, rarity, maxMints, refresh } = getQuery(event)

  if (start !== undefined && typeof start !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid start date' })
  }
  if (end !== undefined && typeof end !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid end date' })
  }

  let endDate = null
  if (typeof end === 'string') {
    endDate = parseEndYMD(end)
    if (!endDate) throw createError({ statusCode: 400, statusMessage: 'Invalid end date' })
  }
  let startDate = null
  if (typeof start === 'string') {
    startDate = parseStartYMD(start)
    if (!startDate) throw createError({ statusCode: 400, statusMessage: 'Invalid start date' })
  }

  if (!endDate) endDate = new Date()
  if (!startDate) {
    const s = new Date(endDate)
    s.setUTCDate(s.getUTCDate() - 29)
    startDate = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0))
  }

  if (startDate > endDate) {
    const tmp = startDate
    startDate = endDate
    endDate = tmp
  }

  const spanMs = endDate.getTime() - startDate.getTime()
  if (spanMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw createError({ statusCode: 400, statusMessage: `Date range cannot exceed ${MAX_RANGE_DAYS} days` })
  }

  let rarityFilter = 'all'
  if (rarity !== undefined) {
    if (typeof rarity !== 'string' || (rarity !== 'all' && !RARITIES.includes(rarity))) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid rarity' })
    }
    rarityFilter = rarity
  }

  let maxMintsNum = 5
  if (maxMints !== undefined) {
    if (typeof maxMints !== 'string' || !/^\d+$/.test(maxMints)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid maxMints' })
    }
    maxMintsNum = parseInt(maxMints, 10)
    if (maxMintsNum < 1 || maxMintsNum > 10) {
      throw createError({ statusCode: 400, statusMessage: 'maxMints must be between 1 and 10' })
    }
  }

  const bypassCache = refresh === '1'

  const startKey = startDate.toISOString()
  const endKey = endDate.toISOString()
  const cacheKey = `admin:user-mints:${startKey}:${endKey}:${rarityFilter}:${maxMintsNum}`

  if (!bypassCache) {
    try {
      const hit = await redis.get(cacheKey)
      if (hit) return JSON.parse(hit)
    } catch {}
  }

  const systemUserIds = await getSystemUserIds()

  let groups
  try {
    groups = await prisma.ctoonOwnerLog.groupBy({
      by: ['userId'],
      where: {
        userId: { notIn: systemUserIds },
        createdAt: { gte: startDate, lte: endDate },
        method: { not: null, notIn: NON_MINT_METHODS },
        ...(rarityFilter !== 'all' ? { ctoon: { rarity: rarityFilter } } : {})
      },
      _count: { _all: true },
      having: { userId: { _count: { lte: maxMintsNum } } }
    })
  } catch (err) {
    console.error('user-mints groupBy failed:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load mint data' })
  }

  const usableGroups = groups.filter(g => g.userId)
  const truncated = usableGroups.length > MAX_RESULT_ROWS
  const limitedGroups = truncated
    ? usableGroups.sort((a, b) => b._count._all - a._count._all).slice(0, MAX_RESULT_ROWS)
    : usableGroups

  const userIds = limitedGroups.map(g => g.userId)
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true }
      })
    : []
  const usernameById = new Map(users.map(u => [u.id, u.username || 'Unknown']))

  const data = limitedGroups
    .map(g => ({ username: usernameById.get(g.userId) || 'Unknown', count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  const result = {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
    rarity: rarityFilter,
    maxMints: maxMintsNum,
    data,
    truncated
  }

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
  } catch {}

  logAdminChange(prisma, {
    userId: me.id,
    area: 'CheckUserMints',
    key: 'query',
    newValue: { start: result.start, end: result.end, rarity: rarityFilter, maxMints: maxMintsNum, resultCount: data.length }
  })

  return result
})
