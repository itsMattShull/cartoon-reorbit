import { defineEventHandler, createError, getRequestHeader } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing tournament id' })

  let tournament = await prisma.gtoonTournament.findUnique({
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
      finalizedAt: true,
      finalPlacementsJson: true,
      winnerUserId: true,
      tournamentCompletedAt: true
    }
  })

  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const now = new Date()
  if (
    tournament.status === 'DRAFT' &&
    now >= tournament.optInStartAt &&
    now <= tournament.optInEndAt
  ) {
    const opened = await prisma.gtoonTournament.updateMany({
      where: { id: tournament.id, status: 'DRAFT' },
      data: {
        status: 'OPT_IN_OPEN',
        nextAnnouncementAt: tournament.optInStartAt,
        lastAnnouncementAt: null,
        finalOptInMidnightAnnouncementSent: false
      }
    })
    if (opened.count) {
      tournament = { ...tournament, status: 'OPT_IN_OPEN' }
    }
  }

  const optInCount = await prisma.gtoonTournamentOptIn.count({
    where: { tournamentId: tournament.id, isActive: true }
  })

  let isOptedIn = false
  const cookie = getRequestHeader(event, 'cookie') || ''
  if (cookie) {
    try {
      const me = await $fetch('/api/auth/me', { headers: { cookie } })
      if (me?.id) {
        const optIn = await prisma.gtoonTournamentOptIn.findUnique({
          where: {
            tournamentId_userId: {
              tournamentId: tournament.id,
              userId: me.id
            }
          },
          select: { isActive: true }
        })
        isOptedIn = !!optIn?.isActive
      }
    } catch {
      // ignore
    }
  }

  return {
    ...tournament,
    optInCount,
    isOptedIn
  }
})
