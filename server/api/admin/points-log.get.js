// server/api/admin/points-log.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

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
  const username = typeof query.username === 'string' ? query.username.trim() : ''
  const from = query.from ? parseStartYMD(String(query.from)) : null
  const to = query.to ? parseEndYMD(String(query.to)) : null

  const where = {
    ...(username
      ? { user: { username: { contains: username, mode: 'insensitive' } } }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {})
  }

  const [total, logs] = await Promise.all([
    prisma.pointsLog.count({ where }),
    prisma.pointsLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true } } }
    })
  ])

  const items = logs.map(l => ({
    id:        l.id,
    user:      l.user,
    direction: l.direction,
    total:    l.total, // the user’s total points after this change
    points:    l.points,
    method:    l.method,
    createdAt: l.createdAt
  }))

  return { items, total, page, limit }
})
