// POST /api/admin/og-tournaments/:id/recompute — score any finished games, rebuild the records and
// advance the tournament if its round is complete. Safe to press at any time.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { advanceAndNotify } from '@/server/utils/ogGtoonTournament'
import { settleMatchFromGames } from '@/server/utils/ogGtoonTournamentLive'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  await requireAdmin(event)
  const id = String(event.context.params?.id || '')
  if (!(await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { id: true } }))) {
    throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  }
  const open = await prisma.ogGtoonTournamentMatch.findMany({ where: { tournamentId: id, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] } }, select: { id: true } })
  for (const m of open) await settleMatchFromGames(m.id)
  await advanceAndNotify(prisma, id)
  return { ok: true }
})
