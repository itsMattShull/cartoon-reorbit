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
  const order = q.order === 'asc' ? 'asc' : 'desc'
  const achievementId = typeof q.achievementId === 'string' && q.achievementId ? q.achievementId : undefined
  const where = achievementId ? { achievementId } : undefined

  const [total, logs, achievements] = await Promise.all([
    prisma.achievementUser.count({ where }),
    prisma.achievementUser.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, discordTag: true } },
        achievement: { select: { id: true, title: true, slug: true } }
      },
      orderBy: { achievedAt: order },
      skip,
      take
    }),
    prisma.achievement.findMany({
      select: { id: true, title: true, slug: true },
      orderBy: { title: 'asc' }
    })
  ])

  return { items: logs, total, page, limit: take, achievements }
})
