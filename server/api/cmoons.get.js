// server/api/cmoons.get.js
// Public list of cMoons with live member counts, used by the selection UI, cZone, leaderboard,
// and (via ?view=nav) the /newsite/cmoon-nav quick-nav page. One in-process cache of the full
// unfiltered row set backs every view — this is read on every visit to pages that show cMoon
// data, and member counts don't need to be millisecond-fresh. Deliberately NOT a second cached
// endpoint for the nav view: that would need its own invalidation call wired into every admin
// cMoon mutation route alongside invalidateCMoonList() below, and missing one would silently
// serve stale data after an admin edit.
import { defineEventHandler, getQuery } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

let cachedAll = null
let cachedAt = 0
const TTL_MS = 30_000

async function getAllCMoons() {
  const now = Date.now()
  if (!cachedAll || (now - cachedAt) >= TTL_MS) {
    cachedAll = await db.cMoon.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, color: true, memberCount: true, imagePath: true, avatarPath: true,
        effectType: true, joinLocked: true, showOnNav: true,
      },
    })
    cachedAt = now
  }
  return cachedAll
}

export default defineEventHandler(async (event) => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { cMoonEnabled: false, cmoons: [] }

  const all = await getAllCMoons()
  const view = getQuery(event)?.view

  // ?view=nav: the /newsite/cmoon-nav quick-nav page — includes joinLocked cMoons that an admin
  // has opted into `showOnNav` (browsable, still not joinable). Default view: the join
  // flow/cZone/leaderboard list, unchanged — locked cMoons stay hidden here, see
  // CMoon.joinLocked in prisma/schema.prisma.
  const cmoons = view === 'nav'
    ? all.filter(c => c.showOnNav)
    : all.filter(c => !c.joinLocked)

  return { cMoonEnabled: true, cmoons }
})

// Imported by the admin cMoon mutation routes (create/update/delete/image) so a name, color, or
// poster change is visible immediately rather than waiting out the TTL — same
// export-a-named-function-from-a-route-file pattern as clearSearchesCache in
// server/api/czone/[username]/searches.get.js.
export function invalidateCMoonList() {
  cachedAll = null
  cachedAt = 0
}
