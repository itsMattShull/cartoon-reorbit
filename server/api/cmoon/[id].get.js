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
import { getPollResults } from '@/server/utils/cmoon'

const FEATURED_CTOON_LIMIT = 12
const LEADERBOARD_LIMIT = 15

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const cmoon = await db.cMoon.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      color: true,
      pageBannerImagePath: true,
      pageDescription: true,
      memberCount: true,
      teamScore: true,
      captains: { select: { user: { select: { username: true } } } },
      prizeCtoons: { select: { quantity: true, ctoon: { select: { name: true, assetPath: true } } } },
      _count: { select: { featuredCtoons: true } }
    }
  })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  // Featured cToons: an admin-curated ordered list (up to 12) if one exists, otherwise the first
  // 12 cToons display-assigned to this cMoon (by createdAt as a "first added" proxy — there's no
  // dedicated assignment timestamp). Which query to run is decided from the _count above (free —
  // no extra round trip), so this is always exactly one query, batched into the same Promise.all
  // as everything else below rather than run sequentially.
  const featuredCtoonsQuery = cmoon._count.featuredCtoons > 0
    ? db.cMoonFeaturedCtoon.findMany({
        where: { cMoonId: id },
        orderBy: { sortOrder: 'asc' },
        select: { ctoon: { select: { id: true, name: true, assetPath: true } } },
      }).then(rows => rows.map(r => r.ctoon))
    : db.ctoon.findMany({
        where: { cMoonId: id },
        select: { id: true, name: true, assetPath: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: FEATURED_CTOON_LIMIT,
      })

  // Both leaderboard views (point contributors / top ranking members) are bundled into this one
  // payload rather than a separate on-demand endpoint — each is a cheap LIMIT-15 query, and a
  // dropdown that defaults to showing one of them on load would pay the extra round trip on
  // effectively every page view anyway, with none of the savings a truly on-demand fetch buys.
  const [featuredCtoons, rankRows, topPointContributors, topRankMembers, poll] = await Promise.all([
    featuredCtoonsQuery,
    db.cMoon.count({ where: { teamScore: { gt: cmoon.teamScore } } }),
    db.user.findMany({
      where: { cMoonId: id, active: true, banned: false, id: { not: EXCLUDED_SYSTEM_USER_ID } },
      orderBy: { cMoonPoints: 'desc' },
      take: LEADERBOARD_LIMIT,
      select: { username: true, avatar: true, cMoonPoints: true },
    }),
    db.user.findMany({
      where: { cMoonId: id, active: true, banned: false, id: { not: EXCLUDED_SYSTEM_USER_ID }, currentCMoonRankId: { not: null } },
      orderBy: { currentCMoonRank: { sortOrder: 'desc' } },
      take: LEADERBOARD_LIMIT,
      select: { username: true, avatar: true, currentCMoonRank: { select: { name: true } } },
    }),
    db.cMoonPoll.findUnique({
      where: { cMoonId: id },
      select: {
        id: true,
        question: true,
        options: { select: { id: true, label: true }, orderBy: { sortOrder: 'asc' } },
        votes: { where: { userId }, select: { optionId: true } },
      },
    }),
  ])

  // Results are only ever shown to a user once they've voted (product decision) — computed (and
  // cached — see getPollResults) only when that's actually true, so the client never receives
  // vote counts pre-vote.
  let pollPayload = null
  if (poll) {
    const myVote = poll.votes[0]?.optionId || null
    const results = myVote ? await getPollResults(poll.id) : null
    pollPayload = {
      id: poll.id,
      question: poll.question,
      options: poll.options.map(o => ({ id: o.id, label: o.label })),
      myVote,
      results,
    }
  }

  return {
    id: cmoon.id,
    name: cmoon.name,
    color: cmoon.color,
    pageBannerImagePath: cmoon.pageBannerImagePath,
    pageDescription: cmoon.pageDescription,
    featuredCtoons,
    memberCount: cmoon.memberCount,
    teamScore: cmoon.teamScore,
    rank: rankRows + 1,
    captains: cmoon.captains.map(cap => cap.user?.username).filter(Boolean),
    prizeCtoons: cmoon.prizeCtoons.map(pc => ({ name: pc.ctoon?.name || '', assetPath: pc.ctoon?.assetPath || null, quantity: pc.quantity })),
    topPointContributors: topPointContributors.map(u => ({ username: u.username, avatar: u.avatar, points: u.cMoonPoints })),
    topRankMembers: topRankMembers.map(u => ({ username: u.username, avatar: u.avatar, rankName: u.currentCMoonRank?.name || '' })),
    poll: pollPayload,
  }
})
