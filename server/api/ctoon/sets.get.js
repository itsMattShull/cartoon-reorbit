import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

function normalizeQuery(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const q = normalizeQuery(getQuery(event).q)
  if (q.length < 3) return []

  const records = await prisma.ctoon.findMany({
    where: {
      set: {
        not: null,
        contains: q,
        mode: 'insensitive'
      }
    },
    distinct: ['set'],
    select: { set: true },
    orderBy: { set: 'asc' },
    take: 25
  })

  return records.map(r => r.set).filter(Boolean)
})
