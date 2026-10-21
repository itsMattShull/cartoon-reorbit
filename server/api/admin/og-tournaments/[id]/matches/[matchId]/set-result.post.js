// POST /api/admin/og-tournaments/:id/matches/:matchId/set-result
//   { outcome: 'A_WIN' | 'B_WIN' | 'TIE', winsA?, winsB?, note }
// Names the result of any unfinished pairing. A reason is required and is logged.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { adminSetMatchResult, advanceAndNotify } from '@/server/utils/ogGtoonTournament'
import { OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const { id, matchId } = event.context.params || {}
  const body = await readBody(event)
  const before = await prisma.ogGtoonTournamentMatch.findUnique({ where: { id: String(matchId) }, select: { status: true, winsA: true, winsB: true, outcome: true } })
  const res = await adminSetMatchResult(prisma, {
    tournamentId: String(id), matchId: String(matchId), outcome: String(body?.outcome || ''),
    winsA: body?.winsA, winsB: body?.winsB, note: body?.note
  })
  if (!res.ok) throw createError({ statusCode: res.code, statusMessage: res.message })
  await logAdminChange(prisma, {
    userId: me.id, area: OGT_AUDIT_AREA, key: `set-result:${matchId}`,
    prevValue: before ? `${before.status} ${before.winsA}-${before.winsB}` : null,
    newValue: `${body.outcome} — ${String(body.note).trim()}`
  })
  // Build the next round / send the "your match was decided" notices without making the admin wait.
  advanceAndNotify(prisma, String(id)).catch(err => console.error('[ogTournament] advance after set-result failed:', err?.message || err))
  return { ok: true, hadLiveGame: res.hadLiveGame }
})
