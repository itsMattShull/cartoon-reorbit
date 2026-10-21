// POST /api/game/oggtoons/tournaments/:id/opt-out — leave while the opt-in window is open.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { ogtRequireUser, ogtRequireEnabled, ogtId } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  const me = await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)
  const t = await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { id: true, status: true, optInEndAt: true } })
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  if (t.status !== 'OPT_IN_OPEN' || new Date() > t.optInEndAt) throw createError({ statusCode: 400, statusMessage: 'Opt-in is closed' })
  await prisma.ogGtoonTournamentOptIn.updateMany({ where: { tournamentId: id, userId: me.id }, data: { isActive: false } })
  return { ok: true }
})
