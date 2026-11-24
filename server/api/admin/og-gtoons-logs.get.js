// Admin log of OG gToons PvP games (who played whom, winner, points staked, final score).
// The query lives in server/utils/ogGtoonsMatchLog.js so it can be tested without Nitro.
// Sub-admin access: permission ogGtoonsLogs (segment 'og-gtoons-logs' in utils/adminPermissions.js).
import { defineEventHandler, getQuery } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { listOgGtoonMatches } from '@/server/utils/ogGtoonsMatchLog'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return listOgGtoonMatches(db.ogGtoonMatch, getQuery(event))
})
