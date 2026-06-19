import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { decryptIp } from '@/server/utils/ip-encrypt'
import { redis } from '@/server/utils/redis'

const CACHE_TTL_SECONDS = 1800 // 30 minutes

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

  const query = getQuery(event)
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 200)
  const skip = (page - 1) * limit
  const searchTerm = String(query.username || '').trim().toLowerCase()

  // Cache check
  const cacheKey = `admin:duplicate-vpn:${page}:${limit}:${searchTerm}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit)
  } catch {}

  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)

  const vpnLogs = await prisma.vpnLog.findMany({
    where: {
      isVpn: true,
      asn: { not: null },
      detectedAt: { gte: since }
    },
    orderBy: { detectedAt: 'desc' },
    select: {
      userId: true,
      ip: true,
      proxyType: true,
      isp: true,
      org: true,
      asn: true,
      country: true,
      countryCode: true,
      reason: true,
      detectedAt: true,
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

  // Group by ASN. For each user+ASN pair keep the latest log entry.
  const byAsn = {}
  for (const log of vpnLogs) {
    const asn = log.asn
    if (!byAsn[asn]) {
      byAsn[asn] = {
        asn,
        isp: log.isp,
        org: log.org,
        country: log.country,
        countryCode: log.countryCode,
        proxyType: log.proxyType,
        reason: log.reason,
        users: {}
      }
    }
    const username = log.user.username || '__unknown__'
    const ts = log.detectedAt.getTime()
    const existing = byAsn[asn].users[username]
    if (!existing || ts > existing.ts) {
      byAsn[asn].users[username] = {
        ts,
        userId: log.user.id,
        joined: log.user.createdAt,
        discordTag: log.user.discordTag,
        discordCreatedAt: log.user.discordCreatedAt,
        isAdmin: !!log.user.isAdmin,
        ip: log.ip
      }
    }
  }

  // Only keep ASN groups with >1 distinct user
  const groups = Object.values(byAsn)
    .filter(g => Object.keys(g.users).length > 1)
    .map(g => {
      const aliases = Object.entries(g.users).map(([username, info]) => ({
        username,
        userId: info.userId,
        joined: info.joined,
        discordTag: info.discordTag,
        discordCreatedAt: info.discordCreatedAt,
        isAdmin: info.isAdmin,
        lastSeen: new Date(info.ts),
        ip: decryptIp(info.ip)
      }))
      const lastSeenTs = Object.values(g.users).reduce((max, info) => Math.max(max, info.ts), 0)
      return {
        asn: g.asn,
        isp: g.isp,
        org: g.org,
        country: g.country,
        countryCode: g.countryCode,
        proxyType: g.proxyType,
        reason: g.reason,
        aliases,
        lastSeen: new Date(lastSeenTs)
      }
    })
    .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())

  const filteredGroups = searchTerm
    ? groups.filter(g =>
        g.aliases.some(a => String(a.username || '').toLowerCase().includes(searchTerm))
      )
    : groups

  const total = filteredGroups.length
  const paged = filteredGroups.slice(skip, skip + limit)

  // Enrich aliases with points, ctoon count, fingerprint, and trade partners
  const userIds = Array.from(
    new Set(paged.flatMap(g => g.aliases.map(a => a.userId).filter(Boolean)))
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

    const pointsByUser = Object.fromEntries(pointsRows.map(r => [r.userId, r.points]))
    const ctoonsByUser = Object.fromEntries(ctoonGroups.map(r => [r.userId, r._count._all]))
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

    const tradePartnersByUser = {}
    for (const room of tradeRooms) {
      if (!room.traderAId || !room.traderBId) continue
      if (!room.trades.length) continue
      if (!room.trades.every(t => t.confirmed)) continue
      ;(tradePartnersByUser[room.traderAId] ??= new Set()).add(room.traderBId)
      ;(tradePartnersByUser[room.traderBId] ??= new Set()).add(room.traderAId)
    }

    for (const group of paged) {
      const groupAliasesByUserId = Object.fromEntries(
        group.aliases.map(a => [a.userId, a.username])
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
              .filter(pid => pid !== alias.userId && groupAliasesByUserId[pid])
              .map(pid => ({ userId: pid, username: groupAliasesByUserId[pid] }))
          : []
      }
    }
  }

  const result = { groups: paged, total, page, limit }
  try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS) } catch {}
  return result
})
