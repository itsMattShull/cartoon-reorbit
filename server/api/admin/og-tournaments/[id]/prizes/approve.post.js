// POST /api/admin/og-tournaments/:id/prizes/approve — release held prizes (and retry failed ones).
// Payment itself happens in the worker within a few minutes.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { approvePrizeGrants, processPrizeGrants } from '@/server/utils/ogGtoonTournament'
import { OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const id = String(event.context.params?.id || '')
  if (!(await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { id: true } }))) {
    throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  }
  const released = await approvePrizeGrants(prisma, { tournamentId: id, adminId: me.id })
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `approve-prizes:${id}`, prevValue: null, newValue: `${released} prize(s) released` })
  // Start paying right away; the cron sweeps up anything this does not finish.
  processPrizeGrants(prisma).catch(err => console.error('[ogTournament] prize payout failed:', err?.message || err))
  return { ok: true, released }
})
