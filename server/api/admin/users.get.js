// server/api/admin/users.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2) Fetch users with counts
  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
    include: {
      _count: { select: { ctoons: true } },
      points: true,
    }
  })

  // 3) Shape payload
  return users.map(u => ({
    id:          u.id,
    username:    u.username || '(no username)',
    discordTag:  u.discordTag || '(no discord)',
    uniqueCtoons: u._count.ctoons,
    points:      u.points?.points || 0,
    joined:       u.createdAt,
    lastLogin:    u.lastLogin,
  }))
})
