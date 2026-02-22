import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
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
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { q = '' } = getQuery(event)
  const query = String(q || '').trim()
  if (query.length < 3) return []

  const rows = await prisma.ctoon.findMany({
    where: {
      set: {
        not: null,
        startsWith: query
      }
    },
    select: { set: true },
    orderBy: { set: 'asc' },
    distinct: ['set'],
    take: 15
  })

  return rows.map(row => row.set).filter(Boolean)
})
