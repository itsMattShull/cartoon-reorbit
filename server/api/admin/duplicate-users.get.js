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
          discordTag: true,
          discordCreatedAt: true
        }
      }
    }
  })

  // 3. Build map of user aliases per IP. We keep admin logins in the
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
        joined: user.createdAt,
        discordTag: user.discordTag,
        discordCreatedAt: user.discordCreatedAt,
        isAdmin: !!user.isAdmin
      }
    }
  }

  // 4. Build only those IP groups with >1 distinct username
  const groups = Object.entries(byIp)
    .filter(([, nameMap]) => Object.keys(nameMap).length > 1)
    .map(([ip, nameMap]) => {
      const aliases = Object.entries(nameMap).map(([username, info]) => ({
        username,
        lastLogin: new Date(info.ts),
        joined: info.joined,
        discordTag: info.discordTag,
        discordCreatedAt: info.discordCreatedAt,
        isAdmin: info.isAdmin
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

  return { groups: paged, total, page, limit }
})
