// server/api/admin/cmoon-pvp-tournaments/[id].put.js — edit a tournament's own fields and/or
// advance its status along DRAFT -> ENTRY_OPEN -> ENTRY_CLOSED. Bracket generation itself
// (CMoonPvpTournamentMatch rows) happens separately once cmoonPvpTournament.js exists (Phase 5) —
// ENTRY_CLOSED here just locks opt-in, same "opt-in locked, bracket generated, waiting for round 1"
// staging CMoonPvpTournamentStatus's own schema comment describes.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const EDITABLE_STATUSES = ['DRAFT', 'ENTRY_OPEN']
const STATUS_FORWARD = { DRAFT: ['ENTRY_OPEN'], ENTRY_OPEN: ['ENTRY_CLOSED', 'DRAFT'] }

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const tournament = await db.cMoonPvpTournament.findUnique({ where: { id } })
  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const body = await readBody(event)
  const data = {}

  if (body?.name !== undefined || body?.maxTeamSize !== undefined || body?.announcementText !== undefined || body?.discordChannelId !== undefined) {
    if (!EDITABLE_STATUSES.includes(tournament.status)) {
      throw createError({ statusCode: 409, statusMessage: 'This tournament can no longer be edited — its bracket is already underway' })
    }
  }
  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
    data.name = name
  }
  if (body?.maxTeamSize !== undefined) {
    const size = Number(body.maxTeamSize)
    if (!Number.isInteger(size) || size < 1 || size > 8) {
      throw createError({ statusCode: 400, statusMessage: 'Max team size must be a whole number between 1 and 8' })
    }
    data.maxTeamSize = size
  }
  if (body?.announcementText !== undefined) {
    data.announcementText = typeof body.announcementText === 'string' ? body.announcementText.trim() || null : null
  }
  if (body?.discordChannelId !== undefined) {
    data.discordChannelId = typeof body.discordChannelId === 'string' ? body.discordChannelId.trim() || null : null
  }

  if (body?.status !== undefined) {
    const nextStatus = String(body.status)
    const allowed = STATUS_FORWARD[tournament.status] || []
    if (!allowed.includes(nextStatus)) {
      throw createError({ statusCode: 409, statusMessage: `Cannot move a ${tournament.status} tournament to ${nextStatus}` })
    }
    if (nextStatus === 'ENTRY_CLOSED') {
      const entryCount = await db.cMoonPvpTournamentEntry.count({ where: { tournamentId: id } })
      if (entryCount < 2) {
        throw createError({ statusCode: 400, statusMessage: 'At least two teams must enter before closing entries' })
      }
    }
    data.status = nextStatus
  }

  const updated = await db.cMoonPvpTournament.update({ where: { id }, data })

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPvpTournament', key: `update:${id}`,
    prevValue: { name: tournament.name, maxTeamSize: tournament.maxTeamSize, status: tournament.status },
    newValue: { name: updated.name, maxTeamSize: updated.maxTeamSize, status: updated.status },
  })

  return { tournament: updated }
})
