import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { decryptIp } from '@/server/utils/ip-encrypt'
import { redis } from '@/server/utils/redis'

const CACHE_TTL_SECONDS = 1800 // 30 minutes

export default defineEventHandler(async (event) => {
  // 1. Admin auth
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

  const query = getQuery(event)
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 200)
  const skip = (page - 1) * limit
  const searchTerm = String(query.username || '').trim().toLowerCase()

  // 2. Cache check
  const cacheKey = `admin:duplicate-users:${page}:${limit}:${searchTerm}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit)
  } catch {}

  // 3. Fetch login logs with user info — limit to last 90 days to avoid loading the full table
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const logs = await prisma.loginLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          isAdmin: true,
          createdAt: true,
          discordTag: true,
          discordCreatedAt: true
        }
      }
    }
  })

  // 4. Build map of user aliases per IP. We keep admin logins in the
  //    grouping (with an isAdmin flag on the alias) so admins testing
  //    other accounts on shared devices still surface in Cheat Finder.
  const byIp = {}

  for (const { ip, createdAt, user } of logs) {
    const ts = createdAt.getTime()
    const name = user.username || '__unknown__'
    byIp[ip] = byIp[ip] || {}
    // for each alias keep the latest login timestamp + user metadata
    const existing = byIp[ip][name]
    if (!existing || ts > existing.ts) {
      byIp[ip][name] = {
        ts,
        userId: user.id,
        joined: user.createdAt,
        discordTag: user.discordTag,
        discordCreatedAt: user.discordCreatedAt,
        isAdmin: !!user.isAdmin
      }
    }
  }

  // 5. Build only those IP groups with >1 distinct username
  const groups = Object.entries(byIp)
    .filter(([, nameMap]) => Object.keys(nameMap).length > 1)
    .map(([ip, nameMap]) => {
      const aliases = Object.entries(nameMap).map(([username, info]) => ({
        username,
        userId: info.userId,
        lastLogin: new Date(info.ts),
        joined: info.joined,
        discordTag: info.discordTag,
        discordCreatedAt: info.discordCreatedAt,
        isAdmin: info.isAdmin
      }))
      const lastLoginTs = Object.values(nameMap).reduce((max, info) => Math.max(max, info.ts), 0)
      return { ip: decryptIp(ip), aliases, lastLogin: new Date(lastLoginTs) }
    })
    .sort((a, b) => b.lastLogin.getTime() - a.lastLogin.getTime())

  const dedupedByAliases = new Map()
  for (const group of groups) {
    const key = (group.aliases || [])
      .map((alias) => String(alias.username || '').trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('|')

    const existing = dedupedByAliases.get(key)
    const existingTs = existing ? new Date(existing.lastLogin).getTime() : -1
    const groupTs = new Date(group.lastLogin).getTime()
    if (!existing || groupTs > existingTs) {
      dedupedByAliases.set(key, group)
    }
  }

  const dedupedGroups = Array.from(dedupedByAliases.values())
    .sort((a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime())

  const filteredGroups = searchTerm
    ? dedupedGroups.filter((group) =>
      (group.aliases || []).some((alias) =>
        String(alias.username || '').toLowerCase().includes(searchTerm)
      )
    )
    : dedupedGroups

  const total = filteredGroups.length
  const paged = filteredGroups.slice(skip, skip + limit)

  // 6. Enrich aliases on the paged groups with points, ctoon count, and
  //    latest fingerprint visitorId. Batch by userId so we don't fan out
  //    queries per alias.
  const userIds = Array.from(
    new Set(paged.flatMap((g) => g.aliases.map((a) => a.userId).filter(Boolean)))
  )

  if (userIds.length) {
    const [pointsRows, ctoonGroups, fingerprintRows, tradeRooms] = await Promise.all([
      prisma.userPoints.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, points: true }
      }),
      prisma.userCtoon.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, burnedAt: null },
        _count: { _all: true }
      }),
      prisma.deviceFingerprintLog.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, visitorId: true, deviceType: true, createdAt: true }
      }),
      // Only completed trades where BOTH sides are in our scoped userIds.
      // A trade is completed when every Trade row in the room is confirmed.
      prisma.tradeRoom.findMany({
        where: {
          AND: [
            { traderAId: { in: userIds } },
            { traderBId: { in: userIds } }
          ]
        },
        select: {
          traderAId: true,
          traderBId: true,
          trades: { select: { confirmed: true } }
        }
      })
    ])

    const pointsByUser = Object.fromEntries(
      pointsRows.map((r) => [r.userId, r.points])
    )
    const ctoonsByUser = Object.fromEntries(
      ctoonGroups.map((r) => [r.userId, r._count._all])
    )
    const latestFingerprintByUser = {}
    for (const row of fingerprintRows) {
      if (!latestFingerprintByUser[row.userId]) {
        latestFingerprintByUser[row.userId] = {
          visitorId: row.visitorId,
          deviceType: row.deviceType,
          capturedAt: row.createdAt
        }
      }
    }

    // userId -> Set of userIds they've completed a trade with (within scope)
    const tradePartnersByUser = {}
    for (const room of tradeRooms) {
      if (!room.traderAId || !room.traderBId) continue
      if (!room.trades.length) continue
      if (!room.trades.every((t) => t.confirmed)) continue
      ;(tradePartnersByUser[room.traderAId] ??= new Set()).add(room.traderBId)
      ;(tradePartnersByUser[room.traderBId] ??= new Set()).add(room.traderAId)
    }

    for (const group of paged) {
      // username lookup limited to this group's other aliases
      const groupAliasesByUserId = Object.fromEntries(
        group.aliases.map((a) => [a.userId, a.username])
      )
      for (const alias of group.aliases) {
        const fp = latestFingerprintByUser[alias.userId]
        alias.points = pointsByUser[alias.userId] ?? 0
        alias.ctoonCount = ctoonsByUser[alias.userId] ?? 0
        alias.latestVisitorId = fp?.visitorId || null
        alias.latestDeviceType = fp?.deviceType || null
        alias.latestVisitorAt = fp?.capturedAt || null

        const partners = tradePartnersByUser[alias.userId]
        alias.tradedWith = partners
          ? Array.from(partners)
              .filter((pid) => pid !== alias.userId && groupAliasesByUserId[pid])
              .map((pid) => ({ userId: pid, username: groupAliasesByUserId[pid] }))
          : []
      }
    }
  }

  const result = { groups: paged, total, page, limit }
  try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS) } catch {}
  return result
})
