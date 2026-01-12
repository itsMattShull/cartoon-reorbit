import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { recomputeTournamentRecords, advanceBracketRounds } from '@/server/utils/gtoonTournament'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing tournament id' })

  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const matchId = String(body?.matchId || '')
  const winnerUserId = String(body?.winnerUserId || '')
  const notes = String(body?.notes || '')

  if (!matchId || !winnerUserId) {
    throw createError({ statusCode: 400, statusMessage: 'matchId and winnerUserId are required' })
  }

  const match = await prisma.gtoonTournamentMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      tournamentId: true,
      stage: true,
      requiresWinner: true,
      lockedAt: true,
      playerAUserId: true,
      playerBUserId: true
    }
  })

  if (!match || match.tournamentId !== String(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Match not found' })
  }

  if (match.lockedAt) {
    throw createError({ statusCode: 400, statusMessage: 'Match already locked' })
  }

  if (!match.requiresWinner || match.stage !== 'BRACKET') {
    throw createError({ statusCode: 400, statusMessage: 'Match does not require admin resolution' })
  }

  if (![match.playerAUserId, match.playerBUserId].includes(winnerUserId)) {
    throw createError({ statusCode: 400, statusMessage: 'Winner must be one of the match players' })
  }

  const outcome = winnerUserId === match.playerAUserId ? 'A_WIN' : 'B_WIN'
  const now = new Date()

  await prisma.gtoonTournamentMatch.update({
    where: { id: match.id },
    data: {
      outcome,
      winnerUserId,
      status: 'COMPLETE',
      tiebreakMethod: 'ADMIN_SELECT',
      tiebreakResolvedAt: now,
      tiebreakNotes: notes || null,
      completedAt: now,
      lockedAt: now
    }
  })

  await recomputeTournamentRecords(prisma, match.tournamentId)
  await advanceBracketRounds(prisma, { tournamentId: match.tournamentId })

  return { ok: true }
})
