
import { defineEventHandler, getRequestHeader, createError } from 'h3'

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
  const offset = parseInt(query.offset || '0', 10)
  const limit = 50

  const logs = await prisma.loginLog.findMany({
    skip: offset,
    take: limit,
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      user: {
        select: {
          username: true,
          createdAt: true,
          discordTag: true,
          discordCreatedAt: true
        }
      }
    }
  })

  return {
    logs
  }
})
