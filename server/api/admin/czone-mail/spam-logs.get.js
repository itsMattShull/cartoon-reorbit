// server/api/admin/czone-mail/spam-logs.get.js
// Recent burst-guard trips, shown on the admin "Manage cZone Mail" page.

import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const q = getQuery(event)
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 50))

  const rows = await db.cZoneMailSpamLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      count: true,
      windowMinutes: true,
      blockedUntil: true,
      createdAt: true,
      user: { select: { id: true, username: true } }
    }
  })

  const now = new Date()
  return {
    items: rows.map(r => ({
      id: r.id,
      userId: r.user?.id || null,
      username: r.user?.username || null,
      count: r.count,
      windowMinutes: r.windowMinutes,
      blockedUntil: r.blockedUntil,
      stillBlocked: r.blockedUntil > now,
      createdAt: r.createdAt
    }))
  }
})
