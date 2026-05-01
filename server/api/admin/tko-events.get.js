import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const [totalEvents, winnerIds, loserIds, recentRounds] = await Promise.all([
    prisma.tkoRound.count(),

    prisma.tkoRound.findMany({
      where: { winnerUserId: { not: null } },
      select: { winnerUserId: true },
      distinct: ['winnerUserId'],
    }),

    prisma.tkoRound.findMany({
      where: { loserUserId: { not: null } },
      select: { loserUserId: true },
      distinct: ['loserUserId'],
    }),

    prisma.tkoRound.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        match: {
          select: { externalMatchId: true, mode: true, battleCode: true },
        },
      },
    }),
  ])

  const uniqueIds = new Set([
    ...winnerIds.map(r => r.winnerUserId),
    ...loserIds.map(r => r.loserUserId),
  ])

  return {
    totalEvents,
    uniqueReorbitUsers: uniqueIds.size,
    events: recentRounds,
  }
})
