// server/api/cmoons.get.js
// Public list of cMoons with live member counts, used by the selection UI, cZone, leaderboard,
// (via ?view=nav) the /newsite/cmoon-nav quick-nav page, and (via ?view=buttons) the button-pill
// list shown on other cMoons' pages. One in-process cache of the full unfiltered row set backs
// every view — this is read on every visit to pages that show cMoon data, and member counts
// don't need to be millisecond-fresh. Deliberately NOT separate cached endpoints per view: that
// would need its own invalidation call wired into every admin cMoon mutation route alongside
// invalidateCMoonList() below, and missing one would silently serve stale data after an admin edit.
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
        effectType: true, joinLocked: true, showOnNav: true, buttonImagePath: true, showButtonOnPages: true,
        allowOptOutJoin: true,
        // Only populated when effectType is null (see the CMoon_effectType_xor_customJoinEffectId
        // DB constraint) — small string fields, cheap to carry on this already-broad select
        // (effectType itself is already shipped to every view including ?view=nav today).
        customJoinEffect: { select: { backgroundColor: true, vignette: true, imagePath: true, text: true, textColor: true, textPosition: true } },
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
  const query = getQuery(event)
  const view = query?.view

  if (view === 'buttons') {
    // The bottom-right button-pill list on a cMoon page — every OTHER cMoon that has opted in
    // (showButtonOnPages) and actually has art uploaded. Independent of joinLocked/showOnNav: a
    // locked cMoon can still cross-promote itself here.
    const excludeId = typeof query?.excludeId === 'string' ? query.excludeId : null
    const cmoons = all
      .filter(c => c.showButtonOnPages && c.buttonImagePath && c.id !== excludeId)
      .map(c => ({ id: c.id, name: c.name, buttonImagePath: c.buttonImagePath }))
    return { cMoonEnabled: true, cmoons }
  }

  if (view === 'suggestable') {
    // The cToon "Suggest Updates" form's cMoon field — every cMoon a display-tag suggestion is
    // allowed to target. Includes joinLocked cMoons (a cToon's display tag is independent of
    // team membership) but, like ?view=nav, excludes ones an admin has hidden from every public
    // surface (showOnNav=false) — those are deliberately unreleased/staged and shouldn't be
    // suggestible just because this is a different page. id+name only: this list reaches every
    // logged-in user who opens the tab, not just admins.
    const cmoons = all
      .filter(c => c.showOnNav)
      .map(c => ({ id: c.id, name: c.name }))
    return { cMoonEnabled: true, cmoons }
  }

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
