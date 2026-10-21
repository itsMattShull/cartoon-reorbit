// POST /api/game/oggtoons/tournaments/:id/repair-deck   { replacements: [{ position, ctoonId }] }
// Replace the cards of your locked deck that are no longer valid. Only flagged slots, only between
// series.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { repairLockedDeck } from '@/server/utils/ogGtoonTournament'
import { ogtRequireUser, ogtRequireEnabled, ogtId } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  const me = await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)
  const body = await readBody(event)
  const res = await repairLockedDeck(prisma, { tournamentId: id, userId: me.id, replacements: body?.replacements })
  if (!res.ok) throw createError({ statusCode: res.code, statusMessage: res.message, data: res.flagged ? { flagged: res.flagged } : undefined })
  return res
})
