import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const query = getQuery(event)
  const status = typeof query.status === 'string' && query.status.trim()
    ? query.status.trim()
    : 'IN_REVIEW'

  const suggestions = await prisma.ctoonUserSuggestion.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, discordTag: true } },
      ctoon: { select: { id: true, name: true, assetPath: true, series: true, set: true, characters: true } }
    }
  })

  return suggestions.map(s => ({
    id: s.id,
    status: s.status,
    oldValues: s.oldValues,
    newValues: s.newValues,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    user: s.user,
    ctoon: s.ctoon
  }))
})
