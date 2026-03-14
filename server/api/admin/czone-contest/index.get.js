// GET /api/admin/czone-contest — list all contests
import { defineEventHandler, getRequestHeader, createError, getQuery } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const { showAll } = getQuery(event)

  const where = showAll === 'true' ? {} : {
    OR: [
      { distributedAt: null },
      { endDate: { gte: new Date() } }
    ]
  }

  const contests = await prisma.cZoneContest.findMany({
    where,
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      maxVotesPerUser: true,
      winnerPrizes: true,
      participantPrizes: true,
      winnerId: true,
      distributedAt: true,
      createdAt: true,
      _count: { select: { submissions: true } }
    },
    orderBy: { startDate: 'desc' }
  })

  return contests
})
