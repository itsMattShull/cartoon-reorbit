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

  // 2. Fetch all login logs with user info
  const logs = await prisma.loginLog.findMany({
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
    // for each alias keep the latest timestamp
    if (!byIp[ip][name] || ts > byIp[ip][name]) {
      byIp[ip][name] = ts
    }
  }

  // 4. Build only those IP groups with >1 distinct username and no admin on that IP
  const groups = Object.entries(byIp)
    .filter(([ip, nameMap]) =>
      !ipsWithAdmin.has(ip) &&
      Object.keys(nameMap).length > 1
    )
    .map(([ip, nameMap]) => {
      const aliases = Object.entries(nameMap).map(([username, ts]) => ({
        username,
        lastLogin: new Date(ts)
      }))
      const lastLoginTs = Object.values(nameMap).reduce((max, ts) => Math.max(max, ts), 0)
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

  return { groups: paged, total, page, limit }
})
