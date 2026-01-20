import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const query = getQuery(event)
  const statusQuery = typeof query.status === 'string' && query.status.trim()
    ? query.status.trim().toUpperCase()
    : 'IN_REVIEW'
  const where = statusQuery === 'HISTORY'
    ? { status: { in: ['ACCEPTED', 'REJECTED'] } }
    : { status: statusQuery }

  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 100)
  const skip = (page - 1) * limit

  const [total, suggestions] = await Promise.all([
    prisma.ctoonUserSuggestion.count({ where }),
    prisma.ctoonUserSuggestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, discordTag: true } },
        ctoon: { select: { id: true, name: true, assetPath: true, series: true, set: true, characters: true, description: true } }
      },
      skip,
      take: limit
    })
  ])

  return {
    items: suggestions.map(s => ({
      id: s.id,
      status: s.status,
      oldValues: s.oldValues,
      newValues: s.newValues,
      rejectionReason: s.rejectionReason,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      user: s.user,
      ctoon: s.ctoon
    })),
    total,
    page,
    limit
  }
})
