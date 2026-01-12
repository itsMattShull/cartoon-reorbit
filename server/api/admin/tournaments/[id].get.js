import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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
    select: {
      id: true,
      name: true,
      status: true,
      format: true,
      optInStartAt: true,
      optInEndAt: true,
      swissRounds: true,
      bestOf: true,
      maxSuddenDeathGames: true,
      announcementChannelId: true,
      lastAnnouncementAt: true,
      nextAnnouncementAt: true,
      finalizedAt: true,
      finalPlacementsJson: true,
      winnerUserId: true,
      tournamentCompletedAt: true
    }
  })

  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const optIns = await prisma.gtoonTournamentOptIn.findMany({
    where: { tournamentId: tournament.id },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { optedInAt: 'asc' }
  })

  return { tournament, optIns }
})
