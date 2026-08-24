// server/api/cmoon/[id].get.js
// Public "cMoon page" data — a display/catalog feature, independent of the
// cMoonEnabled faction-join flag. Requires a logged-in session only (not
// admin), matching the rest of /newsite. Explicit `select` throughout, never
// a bare `include`, since CMoon also has `members`/`captains` relations that
// pull full User rows (Discord tokens, email, ban status) — this endpoint
// must never be able to leak those.
//
// Also carries the cMoon team leaderboard fields (teamScore, rank, top
// members) — this page and the team leaderboard page turned out to be the
// same page, so their data lives in one endpoint rather than two competing
// per-cMoon routes.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

// Deterministic ordering (name, then id as a tiebreaker) so the visible page
// of cToons doesn't silently shuffle between requests; ctoonsTruncated tells
// the client when a cMoon has more than fit here so it isn't a silent cutoff.
const CTOON_PAGE_SIZE = 200
const TOP_MEMBERS_LIMIT = 20

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
      memberCount: true,
      teamScore: true,
      locked: true,
      captains: { select: { user: { select: { username: true } } } },
      prizeCtoons: { select: { quantity: true, ctoon: { select: { name: true, assetPath: true } } } },
      _count: { select: { displayedCtoons: true } }
    }
  })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const [ctoons, rankRows, topMembers] = await Promise.all([
    db.ctoon.findMany({
      where: { cMoonId: id },
      select: { id: true, name: true, assetPath: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: CTOON_PAGE_SIZE
    }),
    db.cMoon.count({ where: { teamScore: { gt: cmoon.teamScore } } }),
    db.user.findMany({
      where: { cMoonId: id, active: true, banned: false, id: { not: EXCLUDED_SYSTEM_USER_ID } },
      orderBy: { points: { points: 'desc' } },
      take: TOP_MEMBERS_LIMIT,
      select: { username: true, avatar: true, points: { select: { points: true } } },
    }),
  ])

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
    ctoonsTruncated: ctoonCount > ctoons.length,
    memberCount: cmoon.memberCount,
    teamScore: cmoon.teamScore,
    locked: cmoon.locked,
    rank: rankRows + 1,
    captains: cmoon.captains.map(cap => cap.user?.username).filter(Boolean),
    prizeCtoons: cmoon.prizeCtoons.map(pc => ({ name: pc.ctoon?.name || '', assetPath: pc.ctoon?.assetPath || null, quantity: pc.quantity })),
    topMembers: topMembers.map(u => ({ username: u.username, avatar: u.avatar, points: u.points?.points || 0 })),
  }
})
