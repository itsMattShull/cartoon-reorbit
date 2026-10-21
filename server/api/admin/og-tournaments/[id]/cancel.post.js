// POST /api/admin/og-tournaments/:id/cancel — stops a tournament. Pairings are left as they were;
// any live game is closed by the socket server within a minute and does not count.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { cancelTournament } from '@/server/utils/ogGtoonTournament'
import { OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const id = String(event.context.params?.id || '')
  const t = await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { status: true } })
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  if (['COMPLETE', 'CANCELLED'].includes(t.status)) throw createError({ statusCode: 400, statusMessage: 'This tournament is already finished' })
  await cancelTournament(prisma, id)
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `cancel:${id}`, prevValue: t.status, newValue: 'CANCELLED' })
  return { ok: true }
})
