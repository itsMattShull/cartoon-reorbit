// POST /api/admin/og-tournaments/:id/players/:userId/disqualify   { note }
// Removes a player: their open pairings go to their opponents and they are excluded from prizes.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { disqualifyPlayer, advanceAndNotify } from '@/server/utils/ogGtoonTournament'
import { OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const { id, userId } = event.context.params || {}
  const note = String((await readBody(event))?.note || '').trim()
  if (!note) throw createError({ statusCode: 400, statusMessage: 'A reason is required' })
  const optIn = await prisma.ogGtoonTournamentOptIn.findUnique({
    where: { tournamentId_userId: { tournamentId: String(id), userId: String(userId) } },
    include: { user: { select: { username: true } }, tournament: { select: { status: true } } }
  })
  if (!optIn) throw createError({ statusCode: 404, statusMessage: 'That player is not in this tournament' })
  if (['COMPLETE', 'CANCELLED'].includes(optIn.tournament.status)) throw createError({ statusCode: 400, statusMessage: 'This tournament is finished' })
  const settled = await disqualifyPlayer(prisma, { tournamentId: String(id), userId: String(userId), note })
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `disqualify:${id}`, prevValue: null, newValue: note, targetUserId: String(userId), targetUsername: optIn.user?.username })
  advanceAndNotify(prisma, String(id)).catch(err => console.error('[ogTournament] advance after disqualify failed:', err?.message || err))
  return { ok: true, pairingsSettled: settled }
})
