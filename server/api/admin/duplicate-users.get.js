import { defineEventHandler, getRequestHeader, createError } from 'h3'
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
    .map(([ip, nameMap]) => ({
      ip,
      aliases: Object.entries(nameMap).map(([username, ts]) => ({
        username,
        lastLogin: new Date(ts)
      }))
    }))

  return { groups }
})
