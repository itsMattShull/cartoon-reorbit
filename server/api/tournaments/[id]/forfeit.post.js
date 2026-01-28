import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { recomputeTournamentRecords, advanceSwissRounds, advanceBracketRounds } from '@/server/utils/gtoonTournament'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing tournament id' })

  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }

  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const matchId = String(body?.matchId || '')
  if (!matchId) throw createError({ statusCode: 400, statusMessage: 'matchId is required' })

  const match = await prisma.gtoonTournamentMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      tournamentId: true,
      stage: true,
      status: true,
      lockedAt: true,
      bestOf: true,
      playerAUserId: true,
      playerBUserId: true,
      tiebreakMethod: true
    }
  })

  if (!match || match.tournamentId !== String(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Match not found' })
  }

  if (match.lockedAt) {
    throw createError({ statusCode: 400, statusMessage: 'Match already locked' })
  }

  if (match.status !== 'PENDING') {
    throw createError({ statusCode: 400, statusMessage: 'Match is no longer pending' })
  }

  const isPlayerA = match.playerAUserId === me.id
  const isPlayerB = match.playerBUserId === me.id
  if (!isPlayerA && !isPlayerB) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized to forfeit this match' })
  }

  const winnerUserId = isPlayerA ? match.playerBUserId : match.playerAUserId
  if (!winnerUserId) {
    throw createError({ statusCode: 400, statusMessage: 'Opponent not found' })
  }

  const requiredWins = Math.max(1, Math.ceil(Number(match.bestOf || 1) / 2))
  const winsA = winnerUserId === match.playerAUserId ? requiredWins : 0
  const winsB = winnerUserId === match.playerBUserId ? requiredWins : 0
  const now = new Date()
  const forfeitBy = me.username ? `Forfeit by ${me.username}` : 'Forfeit'

  await prisma.gtoonTournamentMatch.update({
    where: { id: match.id },
    data: {
      outcome: winnerUserId === match.playerAUserId ? 'A_WIN' : 'B_WIN',
      winnerUserId,
      status: 'COMPLETE',
      winsA,
      winsB,
      ties: 0,
      gamesCounted: requiredWins,
      tiebreakNotes: forfeitBy,
      completedAt: now,
      lockedAt: now
    }
  })

  await recomputeTournamentRecords(prisma, match.tournamentId)
  if (match.stage === 'SWISS') {
    await advanceSwissRounds(prisma, { tournamentId: match.tournamentId })
  }
  if (match.stage === 'BRACKET') {
    await advanceBracketRounds(prisma, { tournamentId: match.tournamentId })
  }

  return { ok: true }
})
