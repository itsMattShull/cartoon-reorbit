// POST /api/admin/og-tournaments/:id/matches/:matchId/void-game   { gameId }
// Removes one finished game from an undecided series; the players replay it.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { adminVoidGame } from '@/server/utils/ogGtoonTournament'
import { OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const { id, matchId } = event.context.params || {}
  const body = await readBody(event)
  const res = await adminVoidGame(prisma, { tournamentId: String(id), matchId: String(matchId), gameId: String(body?.gameId || '') })
  if (!res.ok) throw createError({ statusCode: res.code, statusMessage: res.message })
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `void-game:${matchId}`, prevValue: String(body.gameId), newValue: 'voided' })
  return { ok: true }
})
