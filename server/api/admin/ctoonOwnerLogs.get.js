// server/api/admin/ctoonOwnerLogs.get.js
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
  // AuthZ: admin only
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // Optional filters + pagination
  const q = getQuery(event)
  const from = q.from ? parseStartYMD(String(q.from)) : null
  const to = q.to ? parseEndYMD(String(q.to)) : null
  const where = {
    ...(q.userId ? { userId: String(q.userId) } : {}),
    ...(q.ctoonId ? { ctoonId: String(q.ctoonId) } : {}),
    ...(q.userCtoonId
      ? { userCtoonId: { contains: String(q.userCtoonId), mode: 'insensitive' } }
      : {}),
    ...(q.mintNumber ? { mintNumber: Number(q.mintNumber) || 0 } : {}),
    ...(q.username
      ? { user: { username: { contains: String(q.username), mode: 'insensitive' } } }
      : {}),
    ...(q.ctoonName
      ? { ctoon: { name: { contains: String(q.ctoonName), mode: 'insensitive' } } }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {}),
  }

  const take = Math.min(Math.max(parseInt(q.limit || '200', 10), 1), 1000)
  const page = Math.max(parseInt(q.page || '1', 10), 1)
  const skip = (page - 1) * take

  const [total, logs] = await Promise.all([
    prisma.ctoonOwnerLog.count({ where }),
    prisma.ctoonOwnerLog.findMany({
      where,
      include: {
        user:  { select: { id: true, username: true } },
        ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  ])

  return { items: logs, total, page, limit: take }
})
