// server/api/leaderboard/cmoon-badges.post.js
// Batched cMoon lookup for the leaderboard: the leaderboard already fetches
// ~10 separate per-board endpoints, so joining cMoon into each of those would
// mean touching a dozen files. Instead the page collects all usernames it's
// about to render and asks once here — a single indexed query, not one
// request per row.
import { defineEventHandler, readBody } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

const MAX_USERNAMES = 500

export default defineEventHandler(async (event) => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return {}

  const body = await readBody(event)
  const usernames = Array.isArray(body?.usernames)
    ? [...new Set(body.usernames.filter(u => typeof u === 'string' && u))].slice(0, MAX_USERNAMES)
    : []
  if (!usernames.length) return {}

  const rows = await db.user.findMany({
    where: { username: { in: usernames } },
    select: { username: true, cMoon: { select: { name: true, color: true } } },
  })

  const map = {}
  for (const row of rows) {
    if (row.cMoon) map[row.username] = row.cMoon
  }
  return map
})
