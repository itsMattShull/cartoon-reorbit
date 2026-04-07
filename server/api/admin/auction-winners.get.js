import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  let me = event.context.user
  if (!me) {
    const cookie = getRequestHeader(event, 'cookie') || ''
    try {
      me = await $fetch('/api/auth/me', { headers: { cookie } })
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { q = '' } = getQuery(event)
  const query = String(q).trim()

  const rows = await prisma.auction.findMany({
    distinct: ['winnerId'],
    where: {
      winnerId: { not: null },
      winner: { username: { contains: query, mode: 'insensitive' } }
    },
    select: {
      winner: { select: { id: true, username: true } }
    },
    take: 10
  })

  const winners = rows.map(r => r.winner).filter(Boolean)
  winners.sort((a, b) => (a.username || '').localeCompare(b.username || ''))

  return winners
})
