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
        // isTraining is stored on every match but was never surfaced here — the points-award
        // gate in server/api/tko/event.post.js only reads `outcome.counted` (fully controlled by
        // the external TKO client), so this is the one place an admin can actually see whether a
        // paid round was a practice/AI match rather than a real head-to-head one.
        match: {
          select: { externalMatchId: true, mode: true, battleCode: true, isTraining: true },
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
