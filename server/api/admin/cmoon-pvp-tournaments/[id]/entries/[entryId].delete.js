// server/api/admin/cmoon-pvp-tournaments/[id]/entries/[entryId].delete.js — remove a team entry
// before the bracket locks. Members cascade with the entry (CMoonPvpTournamentEntryMember's own
// onDelete: Cascade).
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const tournamentId = event.context.params?.id
  const entryId = event.context.params?.entryId
  const entry = await db.cMoonPvpTournamentEntry.findUnique({ where: { id: entryId } })
  if (!entry || entry.tournamentId !== tournamentId) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })

  const tournament = await db.cMoonPvpTournament.findUnique({ where: { id: tournamentId }, select: { status: true } })
  if (!tournament || (tournament.status !== 'DRAFT' && tournament.status !== 'ENTRY_OPEN')) {
    throw createError({ statusCode: 409, statusMessage: 'Entries can no longer be removed from this tournament' })
  }

  await db.cMoonPvpTournamentEntry.delete({ where: { id: entryId } })

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPvpTournamentEntry', key: `delete:${entryId}`,
    prevValue: { tournamentId, teamName: entry.teamName, cMoonId: entry.cMoonId }, newValue: null,
  })

  return { ok: true }
})
