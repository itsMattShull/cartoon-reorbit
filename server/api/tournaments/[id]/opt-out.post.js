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
  if (tournament.status !== 'OPT_IN_OPEN' || now > tournament.optInEndAt) {
    throw createError({ statusCode: 400, statusMessage: 'Opt-in is closed' })
  }

  await prisma.gtoonTournamentOptIn.updateMany({
    where: {
      tournamentId: tournament.id,
      userId: me.id
    },
    data: { isActive: false }
  })

  return { ok: true }
})
