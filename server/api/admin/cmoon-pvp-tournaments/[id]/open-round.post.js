// server/api/admin/cmoon-pvp-tournaments/[id]/open-round.post.js — admin-driven round opener (see
// CMoonPvpTournamentStatus's own schema comment on why this can't be cron-automated: a cron can't
// make two live teams show up at the same instant). Round 1 pairs every entered team by seed
// (join order); each later round pairs the previous round's winners. A pairing with only one real
// entry (a bye — see bracketSizeFor's own power-of-two rounding) auto-advances with no live match;
// every other pairing gets a real CMoonPvpMatch via createTournamentMatch, rosters pre-filled from
// each entry's own membership.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { buildFirstRoundPairings, checkByeAdvance, pairNextRound, isRoundComplete } from '@/server/utils/cmoonPvpTournament'
import { createTournamentMatch } from '@/server/utils/cmoonPvpSocket'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const tournamentId = event.context.params?.id
  const tournament = await db.cMoonPvpTournament.findUnique({
    where: { id: tournamentId },
    include: { entries: { include: { members: true }, orderBy: { createdAt: 'asc' } } },
  })
  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const entryById = new Map(tournament.entries.map(e => [e.id, { id: e.id, cMoonId: e.cMoonId, memberUserIds: e.members.map(m => m.userId) }]))

  let pairings
  let roundNumber

  if (tournament.status === 'ENTRY_CLOSED') {
    if (tournament.entries.length < 2) throw createError({ statusCode: 400, statusMessage: 'At least two teams must enter before opening round 1' })
    roundNumber = 1
    pairings = buildFirstRoundPairings(tournament.entries.map(e => e.id))
  } else if (tournament.status === 'IN_PROGRESS') {
    const currentRound = await db.cMoonPvpTournamentMatch.findMany({
      where: { tournamentId }, orderBy: { createdAt: 'asc' },
    })
    const maxRound = currentRound.reduce((max, m) => Math.max(max, m.roundNumber), 0)
    const currentRoundMatches = currentRound.filter(m => m.roundNumber === maxRound)
    if (!isRoundComplete(currentRoundMatches)) {
      throw createError({ statusCode: 409, statusMessage: `Round ${maxRound} is still in progress — every match in it must resolve before the next round can open` })
    }
    if (currentRoundMatches.length === 1) {
      throw createError({ statusCode: 409, statusMessage: 'This tournament already finished — the Final has been played' })
    }
    roundNumber = maxRound + 1
    pairings = pairNextRound(currentRoundMatches.map(m => m.winnerEntryId))
  } else {
    throw createError({ statusCode: 409, statusMessage: `Cannot open a round for a ${tournament.status} tournament` })
  }

  const created = []
  for (const pairing of pairings) {
    const byeWinner = checkByeAdvance(pairing)
    if (byeWinner) {
      const row = await db.cMoonPvpTournamentMatch.create({
        data: { tournamentId, roundNumber, entryAId: pairing.entryAId, entryBId: pairing.entryBId, winnerEntryId: byeWinner },
      })
      created.push({ tournamentMatchId: row.id, bye: true, winnerEntryId: byeWinner })
      continue
    }

    const row = await db.cMoonPvpTournamentMatch.create({
      data: { tournamentId, roundNumber, entryAId: pairing.entryAId, entryBId: pairing.entryBId },
    })
    const entryA = entryById.get(pairing.entryAId)
    const entryB = entryById.get(pairing.entryBId)
    try {
      const matchId = await createTournamentMatch({ tournamentMatchId: row.id, entryA, entryB })
      created.push({ tournamentMatchId: row.id, bye: false, matchId })
    } catch (err) {
      created.push({ tournamentMatchId: row.id, bye: false, matchId: null, error: err?.message || 'Failed to start this pairing\'s live match' })
    }
  }

  if (tournament.status === 'ENTRY_CLOSED') {
    await db.cMoonPvpTournament.update({ where: { id: tournamentId }, data: { status: 'IN_PROGRESS' } })
  }

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPvpTournament', key: `open-round:${tournamentId}:${roundNumber}`,
    prevValue: null, newValue: { roundNumber, pairings: created },
  })

  return { roundNumber, matches: created }
})
