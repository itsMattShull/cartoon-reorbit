// server/api/admin/cmoon-pvp-tournaments/[id].get.js — one tournament's full detail: entries
// (with their member rosters) and every round's matches so far, for the admin bracket view.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = event.context.params?.id
  const tournament = await db.cMoonPvpTournament.findUnique({
    where: { id },
    include: {
      entries: {
        include: {
          cMoon: { select: { id: true, name: true, color: true, avatarPath: true } },
          members: { include: { user: { select: { id: true, username: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
      matches: { orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }] },
      winnerEntry: { select: { id: true, teamName: true } },
    },
  })
  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  return { tournament }
})
