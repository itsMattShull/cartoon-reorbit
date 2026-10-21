// POST /api/admin/og-tournaments/:id/matches/:matchId/reopen — put a decided pairing back in play
// (only while nothing later has been built from it).
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { adminReopenMatch } from '@/server/utils/ogGtoonTournament'
import { OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const { id, matchId } = event.context.params || {}
  const res = await adminReopenMatch(prisma, { tournamentId: String(id), matchId: String(matchId) })
  if (!res.ok) throw createError({ statusCode: res.code, statusMessage: res.message })
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `reopen:${matchId}`, prevValue: 'decided', newValue: 'reopened' })
  return { ok: true }
})
