import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  // 2. Fetch login logs with user info — limit to last 90 days to avoid loading the full table
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
          discordId: true,
          discordTag: true,
          discordCreatedAt: true
        }
      }
    }
  })

  // 3. Track IPs used by any admin, and build map of user aliases per IP
  const ipsWithAdmin = new Set()
  const byIp = {}

  for (const { ip, createdAt, user } of logs) {
    const ts = createdAt.getTime()

    if (user.isAdmin) {
      // mark this IP and skip grouping it
      ipsWithAdmin.add(ip)
      continue
    }

    const name = user.username || '__unknown__'
    byIp[ip] = byIp[ip] || {}
    // for each alias keep the latest login timestamp + user metadata
    const existing = byIp[ip][name]
    if (!existing || ts > existing.ts) {
      byIp[ip][name] = {
        ts,
        userId: user.id,
        joined: user.createdAt,
        discordId: user.discordId,
        discordTag: user.discordTag,
        discordCreatedAt: user.discordCreatedAt
      }
    }
  }

  // 4. Build only those IP groups with >1 distinct username and no admin on that IP
  const groups = Object.entries(byIp)
    .filter(([ip, nameMap]) =>
      !ipsWithAdmin.has(ip) &&
      Object.keys(nameMap).length > 1
    )
    .map(([ip, nameMap]) => {
      const aliases = Object.entries(nameMap).map(([username, info]) => ({
        username,
        userId: info.userId,
        lastLogin: new Date(info.ts),
        joined: info.joined,
        discordId: info.discordId,
        discordTag: info.discordTag,
        discordCreatedAt: info.discordCreatedAt
      }))
      const lastLoginTs = Object.values(nameMap).reduce((max, info) => Math.max(max, info.ts), 0)
      return { ip, aliases, lastLogin: new Date(lastLoginTs) }
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

  // Enrich only the paged aliases with points and cToon count (single
  // batched query each, scoped to the user IDs visible on this page).
  const visibleUserIds = Array.from(new Set(
    paged.flatMap(g => g.aliases.map(a => a.userId).filter(Boolean))
  ))

  let pointsByUser = new Map()
  let ctoonCountByUser = new Map()
  // tradePartners.get(userId) = Set of other userIds they have any
  // TradeOffer record with (initiator OR recipient on either side).
  const tradePartners = new Map()

  if (visibleUserIds.length) {
    const [pointsRows, ctoonRows, tradeRows] = await Promise.all([
      prisma.userPoints.findMany({
        where: { userId: { in: visibleUserIds } },
        select: { userId: true, points: true }
      }),
      prisma.userCtoon.groupBy({
        by: ['userId'],
        where: { userId: { in: visibleUserIds }, burnedAt: null },
        _count: { _all: true }
      }),
      prisma.tradeOffer.findMany({
        where: {
          initiatorId: { in: visibleUserIds },
          recipientId: { in: visibleUserIds }
        },
        select: { initiatorId: true, recipientId: true }
      })
    ])
    pointsByUser = new Map(pointsRows.map(p => [p.userId, p.points]))
    ctoonCountByUser = new Map(ctoonRows.map(c => [c.userId, c._count._all]))
    for (const t of tradeRows) {
      if (t.initiatorId === t.recipientId) continue
      if (!tradePartners.has(t.initiatorId)) tradePartners.set(t.initiatorId, new Set())
      if (!tradePartners.has(t.recipientId)) tradePartners.set(t.recipientId, new Set())
      tradePartners.get(t.initiatorId).add(t.recipientId)
      tradePartners.get(t.recipientId).add(t.initiatorId)
    }
  }

  const enriched = paged.map(group => {
    // For each alias, find which other aliases in THIS group they've
    // traded with. Trades with users outside the group don't count.
    const groupUserIds = new Set(group.aliases.map(a => a.userId).filter(Boolean))
    const usernameByUserId = new Map(group.aliases.map(a => [a.userId, a.username]))

    let hasInternalTrades = false
    const aliases = group.aliases.map(a => {
      const partners = tradePartners.get(a.userId) || new Set()
      const tradedWith = []
      for (const otherId of partners) {
        if (otherId === a.userId) continue
        if (!groupUserIds.has(otherId)) continue
        const name = usernameByUserId.get(otherId)
        if (name) tradedWith.push(name)
      }
      tradedWith.sort()
      if (tradedWith.length) hasInternalTrades = true
      return {
        ...a,
        points: pointsByUser.get(a.userId) ?? 0,
        ctoonCount: ctoonCountByUser.get(a.userId) ?? 0,
        tradedWith
      }
    })

    return { ...group, aliases, hasInternalTrades }
  })

  return { groups: enriched, total, page, limit }
})
