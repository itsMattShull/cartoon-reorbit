// POST /api/admin/og-tournaments/:id/start — start the tournament now: entry closes and everyone who opted in is
// paired for round 1, exactly as the scheduled start would do. Only works before play has begun.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'
import { startTournament, sendEvents } from '@/server/utils/ogGtoonTournament'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const id = String(event.context.params?.id || '')
  const t = await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { id: true, name: true, status: true } })
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  if (!['OPT_IN_OPEN', 'OPT_IN_CLOSED'].includes(t.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: t.status === 'DRAFT' ? 'Opt-in has not opened yet, so there is nobody to pair' : 'This tournament has already started or ended'
    })
  }
  const events = await startTournament(prisma, id)
  await sendEvents(prisma, events)
  const after = await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { status: true } })
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `start:${id}`, prevValue: t.status, newValue: after?.status || null })
  return { ok: true, status: after?.status, cancelled: after?.status === 'CANCELLED' }
})
