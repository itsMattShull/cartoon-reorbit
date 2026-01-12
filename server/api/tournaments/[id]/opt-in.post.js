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

  const tournament = await prisma.gtoonTournament.findUnique({
    where: { id: String(id) },
    select: { id: true, status: true, optInEndAt: true }
  })
  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const now = new Date()
  if (
    tournament.status === 'DRAFT' &&
    now >= tournament.optInStartAt &&
    now <= tournament.optInEndAt
  ) {
    await prisma.gtoonTournament.updateMany({
      where: { id: tournament.id, status: 'DRAFT' },
      data: {
        status: 'OPT_IN_OPEN',
        nextAnnouncementAt: tournament.optInStartAt,
        lastAnnouncementAt: null,
        finalOptInMidnightAnnouncementSent: false
      }
    })
    tournament.status = 'OPT_IN_OPEN'
  }

  if (tournament.status !== 'OPT_IN_OPEN' || now > tournament.optInEndAt) {
    throw createError({ statusCode: 400, statusMessage: 'Opt-in is closed' })
  }

  await prisma.gtoonTournamentOptIn.upsert({
    where: {
      tournamentId_userId: {
        tournamentId: tournament.id,
        userId: me.id
      }
    },
    create: {
      tournamentId: tournament.id,
      userId: me.id,
      optedInAt: now,
      isActive: true
    },
    update: {
      isActive: true,
      optedInAt: now
    }
  })

  await prisma.gtoonTournamentPlayerRecord.upsert({
    where: {
      tournamentId_userId: {
        tournamentId: tournament.id,
        userId: me.id
      }
    },
    create: {
      tournamentId: tournament.id,
      userId: me.id
    },
    update: {}
  })

  return { ok: true }
})
