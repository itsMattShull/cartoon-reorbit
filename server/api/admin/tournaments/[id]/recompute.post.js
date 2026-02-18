import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { resolveTournamentMatches, recomputeTournamentRecords, advanceSwissRounds, advanceBracketRounds } from '@/server/utils/gtoonTournament'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing tournament id' })

  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const tournament = await prisma.gtoonTournament.findUnique({
    where: { id: String(id) },
    select: { id: true }
  })
  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  await resolveTournamentMatches(prisma, { tournamentId: tournament.id })
  await recomputeTournamentRecords(prisma, tournament.id)
  await advanceSwissRounds(prisma, { tournamentId: tournament.id })
  await advanceBracketRounds(prisma, { tournamentId: tournament.id })

  return { ok: true }
})
