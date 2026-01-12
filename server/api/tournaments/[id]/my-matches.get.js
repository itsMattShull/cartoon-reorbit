import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing tournament id' })

  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }

  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const matches = await prisma.gtoonTournamentMatch.findMany({
    where: {
      tournamentId: String(id),
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      OR: [
        { playerAUserId: me.id },
        { playerBUserId: me.id }
      ]
    },
    include: {
      playerA: { select: { id: true, username: true } },
      playerB: { select: { id: true, username: true } }
    },
    orderBy: [
      { stage: 'asc' },
      { roundNumber: 'asc' }
    ]
  })

  return matches.map(match => {
    const suddenDeathActive =
      match.stage === 'BRACKET' &&
      match.requiresWinner &&
      match.outcome === 'TIE' &&
      !match.winnerUserId

    return {
      id: match.id,
      stage: match.stage,
      roundNumber: match.roundNumber,
      status: match.status,
      playerAUserId: match.playerAUserId,
      playerBUserId: match.playerBUserId,
      playerAName: match.playerA?.username || 'Unknown',
      playerBName: match.playerB?.username || 'Unknown',
      winsA: match.winsA,
      winsB: match.winsB,
      ties: match.ties,
      gamesCounted: match.gamesCounted,
      outcome: match.outcome,
      suddenDeathActive,
      tiebreakNotes: match.tiebreakNotes
    }
  })
})
