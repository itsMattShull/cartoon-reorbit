// server/api/cmoon/[id].get.js
// Public "cMoon page" data — a display/catalog feature, independent of the
// cMoonEnabled faction-join flag. Requires a logged-in session only (not
// admin), matching the rest of /newsite. Explicit `select` throughout, never
// a bare `include`, since CMoon also has `members`/`captains` relations that
// pull full User rows (Discord tokens, email, ban status) — this endpoint
// must never be able to leak those.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

// Deterministic ordering (name, then id as a tiebreaker) so the visible page
// of cToons doesn't silently shuffle between requests; ctoonsTruncated tells
// the client when a cMoon has more than fit here so it isn't a silent cutoff.
const CTOON_PAGE_SIZE = 200

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const cmoon = await db.cMoon.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      color: true,
      pageImagePath: true,
      pageImageWidth: true,
      pageImageHeight: true,
      pageDescription: true,
      bannerImagePath: true,
      _count: { select: { displayedCtoons: true } }
    }
  })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const ctoons = await db.ctoon.findMany({
    where: { cMoonId: id },
    select: { id: true, name: true, assetPath: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: CTOON_PAGE_SIZE
  })

  const ctoonCount = cmoon._count?.displayedCtoons ?? 0

  return {
    id: cmoon.id,
    name: cmoon.name,
    color: cmoon.color,
    pageImagePath: cmoon.pageImagePath,
    pageImageWidth: cmoon.pageImageWidth,
    pageImageHeight: cmoon.pageImageHeight,
    pageDescription: cmoon.pageDescription,
    bannerImagePath: cmoon.bannerImagePath,
    ctoonCount,
    ctoons,
    ctoonsTruncated: ctoonCount > ctoons.length
  }
})
