// POST /api/game/oggtoons/tournaments/:id/forfeit   { matchId }
// Give up your series: the opponent takes it 2-0. Refused while a game is being played.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { forfeitMatch } from '@/server/utils/ogGtoonTournament'
import { ogtRequireUser, ogtRequireEnabled, ogtId, ogtQueueAdvance } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  const me = await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)
  const body = await readBody(event)
  const matchId = String(body?.matchId || '')
  if (!matchId) throw createError({ statusCode: 400, statusMessage: 'matchId is required' })
  const res = await forfeitMatch(prisma, { tournamentId: id, matchId, userId: me.id })
  if (!res.ok) throw createError({ statusCode: res.code, statusMessage: res.message })
  await ogtQueueAdvance(id, matchId)
  return { ok: true }
})
