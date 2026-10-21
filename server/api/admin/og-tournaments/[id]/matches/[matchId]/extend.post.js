// POST /api/admin/og-tournaments/:id/matches/:matchId/extend   { hours }
// Gives one pairing more time (also clears a "needs admin" flag raised by a missed deadline).
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { adminExtendDeadline } from '@/server/utils/ogGtoonTournament'
import { OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const { id, matchId } = event.context.params || {}
  const body = await readBody(event)
  const res = await adminExtendDeadline(prisma, { tournamentId: String(id), matchId: String(matchId), hours: body?.hours })
  if (!res.ok) throw createError({ statusCode: res.code, statusMessage: res.message })
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `extend:${matchId}`, prevValue: null, newValue: `+${res.hours}h` })
  return { ok: true, hours: res.hours }
})
