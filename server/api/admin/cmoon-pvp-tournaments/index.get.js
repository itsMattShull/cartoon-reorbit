// server/api/admin/cmoon-pvp-tournaments/index.get.js — list cMoon PvP tournaments for the admin
// bracket/management UI, newest first.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const tournaments = await db.cMoonPvpTournament.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { entries: true, matches: true } },
      winnerEntry: { select: { id: true, teamName: true } },
    },
  })
  return { tournaments }
})
