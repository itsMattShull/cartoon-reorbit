// server/api/admin/cmoon-pvp-tournaments/[id]/entries.post.js — admin adds ONE team entry to a
// DRAFT or ENTRY_OPEN tournament. Two shapes (see CMoonPvpTournamentEntry's own schema comment):
// cMoonId set -> members snapshot from that cMoon's current roster (optionally narrowed by an
// explicit memberUserIds subset, e.g. to exclude an inactive member); cMoonId omitted -> a mixed
// squad, memberUserIds required and hand-picked up to the tournament's own maxTeamSize.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const tournamentId = event.context.params?.id
  const tournament = await db.cMoonPvpTournament.findUnique({ where: { id: tournamentId } })
  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  if (tournament.status !== 'DRAFT' && tournament.status !== 'ENTRY_OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'Entries can no longer be added to this tournament' })
  }

  const body = await readBody(event)
  const teamName = typeof body?.teamName === 'string' ? body.teamName.trim() : ''
  if (!teamName) throw createError({ statusCode: 400, statusMessage: 'teamName is required' })

  const cMoonId = typeof body?.cMoonId === 'string' && body.cMoonId.trim() ? body.cMoonId.trim() : null
  let memberUserIds = Array.isArray(body?.memberUserIds)
    ? [...new Set(body.memberUserIds.filter(v => typeof v === 'string' && v))]
    : null

  if (cMoonId) {
    const cMoon = await db.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true } })
    if (!cMoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
    const roster = await db.user.findMany({ where: { cMoonId }, select: { id: true } })
    const rosterIds = new Set(roster.map(u => u.id))
    if (memberUserIds) {
      const invalid = memberUserIds.filter(uid => !rosterIds.has(uid))
      if (invalid.length) throw createError({ statusCode: 400, statusMessage: 'memberUserIds must all belong to the selected cMoon' })
    } else {
      memberUserIds = Array.from(rosterIds)
    }
  } else if (!memberUserIds || !memberUserIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'memberUserIds is required for a mixed-squad entry' })
  }

  if (memberUserIds.length > tournament.maxTeamSize) {
    throw createError({ statusCode: 400, statusMessage: `A team may have at most ${tournament.maxTeamSize} members in this tournament` })
  }
  if (!memberUserIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'A team needs at least one member' })
  }

  // A player already on another entry in THIS tournament can never be rostered here too — once a
  // round pairs these entries against each other, createTournamentMatch would try to create two
  // CMoonPvpParticipant rows with the same (matchId, userId) and fail the whole pairing with no
  // recovery short of cancelling the tournament.
  const alreadyRostered = await db.cMoonPvpTournamentEntryMember.findMany({
    where: { userId: { in: memberUserIds }, entry: { tournamentId } },
    select: { userId: true, entry: { select: { teamName: true } } },
  })
  if (alreadyRostered.length) {
    const names = [...new Set(alreadyRostered.map(m => m.entry.teamName))].join(', ')
    throw createError({ statusCode: 409, statusMessage: `One or more of these players are already entered on another team in this tournament (${names})` })
  }

  let created
  try {
    created = await db.cMoonPvpTournamentEntry.create({
      data: {
        tournamentId, teamName, cMoonId,
        members: { create: memberUserIds.map(userId => ({ userId })) },
      },
      include: { members: true },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'A team with that name has already entered this tournament' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPvpTournamentEntry', key: `create:${created.id}`,
    prevValue: null, newValue: { id: created.id, tournamentId, teamName, cMoonId, memberUserIds },
  })

  return { id: created.id }
})
