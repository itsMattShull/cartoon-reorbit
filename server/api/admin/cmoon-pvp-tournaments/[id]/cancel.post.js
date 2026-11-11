// server/api/admin/cmoon-pvp-tournaments/[id]/cancel.post.js — cancel a tournament outright, any
// stage short of COMPLETE. Does not touch any already-created CMoonPvpTournamentMatch rows or
// their linked live CMoonPvpMatch — a match already in flight when the tournament around it is
// cancelled still resolves normally (it just never gets credited to a tournament placement).
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const tournament = await db.cMoonPvpTournament.findUnique({ where: { id } })
  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  if (tournament.status === 'COMPLETE' || tournament.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: `A ${tournament.status} tournament cannot be cancelled` })
  }

  const updated = await db.cMoonPvpTournament.update({ where: { id }, data: { status: 'CANCELLED' } })

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPvpTournament', key: `cancel:${id}`,
    prevValue: { status: tournament.status }, newValue: { status: updated.status },
  })

  return { ok: true }
})
