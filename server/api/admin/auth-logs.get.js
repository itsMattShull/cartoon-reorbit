
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Admin check via your /api/auth/me endpoint
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

  const where = username
    ? { user: { username: { contains: username, mode: 'insensitive' } } }
    : {}

  const [total, logs] = await Promise.all([
    prisma.loginLog.count({ where }),
    prisma.loginLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            username: true,
            createdAt: true,
            discordTag: true,
            discordCreatedAt: true,
            isAdmin: true
          }
        }
      }
    })
  ])

  return {
    items: logs,
    total,
    page,
    limit
  }
})
