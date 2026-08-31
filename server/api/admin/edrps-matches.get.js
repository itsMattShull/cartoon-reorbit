// Admin log of Ed, Edd n Eddy RPS matches.
//
// The query moved to server/utils/duelMatchLog.js when the Pokemon game needed the same view.
// Both tables are written by the same shared runtime and have the same columns, so a second
// copy would only be a second place to fix a filter.
//
// The sameIp / sameVisitorId / response-time columns are the point of this view: two accounts
// trading wins is the obvious way to farm a game this fast, and nothing else in the admin
// tooling looks at game outcomes at all.
import { defineEventHandler, getQuery } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { listDuelMatches } from '@/server/utils/duelMatchLog'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return listDuelMatches(db.edRpsMatch, getQuery(event), { supportsAi: true })
})
