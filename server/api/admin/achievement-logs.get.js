// server/api/admin/achievement-logs.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
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

  const q = getQuery(event)
  const take = 100
  const page = Math.max(parseInt(q.page || '1', 10), 1)
  const skip = (page - 1) * take

  const [total, logs] = await Promise.all([
    prisma.achievementUser.count(),
    prisma.achievementUser.findMany({
      include: {
        user: { select: { id: true, username: true, discordTag: true } },
        achievement: { select: { id: true, title: true, slug: true } }
      },
      orderBy: { achievedAt: 'desc' },
      skip,
      take
    })
  ])

  return { items: logs, total, page, limit: take }
})
