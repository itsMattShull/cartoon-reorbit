// server/api/cmoons.get.js
// Public list of cMoons with live member counts, used by the selection UI,
// cZone, and leaderboard. Cached briefly in-process — this is read on every
// visit to pages that show cMoon data, and member counts don't need to be
// millisecond-fresh.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

let cachedList = null
let cachedAt = 0
const TTL_MS = 30_000

export default defineEventHandler(async () => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { cMoonEnabled: false, cmoons: [] }

  const now = Date.now()
  if (!cachedList || (now - cachedAt) >= TTL_MS) {
    cachedList = await db.cMoon.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true, memberCount: true },
    })
    cachedAt = now
  }

  return { cMoonEnabled: true, cmoons: cachedList }
})
