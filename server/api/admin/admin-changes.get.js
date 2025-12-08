// server/api/admin/admin-changes.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const q = getQuery(event)
  const userId = q.userId ? String(q.userId) : undefined
  const area   = q.area ? String(q.area) : undefined
  const start  = q.start ? new Date(String(q.start)) : undefined
  const end    = q.end   ? new Date(String(q.end))   : undefined
  const limit  = q.limit ? Math.min(1000, Math.max(1, Number(q.limit))) : 250

  const where = {}
  if (userId) where.userId = userId
  if (area) where.area = area
  if (start || end) where.createdAt = {}
  if (start) where.createdAt.gte = start
  if (end)   where.createdAt.lte = end

  const rows = await db.adminChangeLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { id: true, username: true, discordTag: true } } }
  })

  // shape response: include formatted CDT time for convenience
  const fmt = (d) => new Date(d).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })

  return rows.map(r => ({
    id: r.id,
    userId: r.userId,
    user: { id: r.user.id, username: r.user.username, discordTag: r.user.discordTag },
    area: r.area,
    key: r.key,
    prevValue: r.prevValue,
    newValue: r.newValue,
    createdAt: r.createdAt,
    createdAtCdt: fmt(r.createdAt)
  }))
})

