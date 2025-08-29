// server/api/admin/ctoonOwnerLogs.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

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
  const where = {
    ...(q.userId ? { userId: String(q.userId) } : {}),
    ...(q.ctoonId ? { ctoonId: String(q.ctoonId) } : {}),
    ...(q.userCtoonId ? { userCtoonId: String(q.userCtoonId) } : {}),
    ...(q.mintNumber ? { mintNumber: Number(q.mintNumber) || 0 } : {}),
    ...(q.username
      ? { user: { username: { contains: String(q.username), mode: 'insensitive' } } }
      : {}),
    ...(q.ctoonName
      ? { ctoon: { name: { contains: String(q.ctoonName), mode: 'insensitive' } } }
      : {}),
  }

  const take = Math.min(Math.max(parseInt(q.limit || '200', 10), 1), 1000)
  const page = Math.max(parseInt(q.page || '1', 10), 1)
  const skip = (page - 1) * take

  const logs = await prisma.ctoonOwnerLog.findMany({
    where,
    include: {
      user:  { select: { id: true, username: true } },
      ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  })

  // Return array for the existing frontend usage
  return logs
})
