import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { isValidCheatFinderType } from '@/server/utils/cheatFinderKey'

const MAX_LIMIT = 200

export default defineEventHandler(async (event) => {
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
  const type = String(query.type || '')
  if (!isValidCheatFinderType(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid type' })
  }
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), MAX_LIMIT)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    prisma.cheatFinderConfirmation.findMany({
      where: { type },
      orderBy: { confirmedAt: 'desc' },
      skip,
      take: limit,
      select: {
        groupKey: true,
        aliasUsernames: true,
        note: true,
        confirmedByUsername: true,
        confirmedAt: true
      }
    }),
    prisma.cheatFinderConfirmation.count({ where: { type } })
  ])

  return { items, total, page, limit }
})
