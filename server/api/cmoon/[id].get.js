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
import { defineEventHandler, createError, setHeader } from 'h3'
import { prisma as db } from '@/server/prisma'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'
import { getPollResults, displayRankName } from '@/server/utils/cmoon'

const FEATURED_CTOON_LIMIT = 12
const LEADERBOARD_LIMIT = 15

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  // Reflects live per-user state (poll myVote/results, offer eligibility elsewhere) — never safe
  // for an intermediary (CDN, reverse proxy) to cache and reuse across users or requests.
  setHeader(event, 'Cache-Control', 'no-store')

  const cmoon = await db.cMoon.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      color: true,
      pageBgColor: true,
      accentColor: true,
      textColor: true,
      cardBgColor: true,
      pageBannerImagePath: true,
      pageBannerWidth: true,
      pageBannerHeight: true,
      pageDescription: true,
      memberCount: true,
      teamScore: true,
      captains: { select: { user: { select: { username: true } } } },
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
  //
  // "Top Point Contributors" sums CMoonScoreLog (the same weekly team-score log teamScore is
  // computed from — see recomputeCMoonTeamScores in server/utils/cmoon.js), not User.cMoonPoints
  // — see server/api/leaderboard/cmoon-standings.get.js's header comment for why: cMoonPoints is
  // a lifetime points-earned-from-anything counter that converges toward a player's whole account
  // balance, not what they've actually contributed to this team. Raw SQL (JOIN + GROUP BY +
  // ORDER BY + LIMIT), mirroring that same endpoint, rather than a denormalized-column read.
  // Rank is by average points per CURRENT member, matching the Leaderboards page's cMoons tab
  // (see server/api/leaderboard/cmoons.get.js) — a large team no longer ranks #1 purely by having
  // more members. Deliberately NOT teamScore / memberCount: teamScore sums every point the team
  // has EVER earned, including from members who've since left (recomputeCMoonTeamScores never
  // re-scopes it to current membership) — dividing that lifetime total by the CURRENT headcount
  // would inflate the average for any team that churned through big-earning members who then
  // left. Summing CMoonScoreLog for rows actually earned for THIS team keeps the average meaning
  // what it's supposed to: what THIS roster is actually earning per player.
  //
  // "csl.cMoonId" = u."cMoonId" is the critical condition, not just u."cMoonId" = ${id}: a
  // CMoonScoreLog row is permanently tagged with whichever cMoon it was earned for (see
  // reassignUserCMoon's own comment in server/utils/cmoon.js) and never moves when a player
  // changes teams (admin reassignment, Balance Teams, accepted change requests). Filtering only
  // on the user's CURRENT cMoonId — without also requiring the row itself belong to that same
  // team — would let a player who switches teams carry every point they ever earned on their OLD
  // team into their new team's average, exactly the kind of distortion this fix exists to remove.
  //
  // No active/banned filter here, unlike "Top Point Contributors" below — that query is a public
  // leaderboard of named individuals (hiding a banned player from it makes sense), this is a
  // team-wide total divided by memberCount, which does NOT exclude banned/inactive members (see
  // ban.post.js / the inactive-account sweep in sync-guild-members.js — neither touches cMoonId
  // or memberCount). Filtering the numerator but not the denominator would unfairly lower a
  // team's average for every banned/inactive member it has. Matches recomputeCMoonTeamScores's
  // own convention (no active/banned filter) for this same reason.
  const thisCurrentMembersTotal = await db.$queryRaw`
    SELECT COALESCE(SUM(csl."points"), 0)::int AS total
    FROM "CMoonScoreLog" csl
    JOIN "User" u ON u."id" = csl."userId" AND u."cMoonId" = ${id}
    WHERE csl."cMoonId" = ${id}
      AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
  `
  const thisAvgScore = cmoon.memberCount > 0 ? thisCurrentMembersTotal[0].total / cmoon.memberCount : 0

  // Captains never earn a different actual rank tier for this — see displayRankName's own
  // comment, this only decides what the "Top Ranking Members" list SHOWS captains as (always
  // "Captain", already true before this change) and now also WHERE it shows them (pinned first,
  // ahead of their real tier's position). Computed up front (cheap — `cmoon.captains` is already
  // loaded) so the captain-pinning query below and the final display mapping can both use it.
  const captainUsernames = new Set(cmoon.captains.map(cap => cap.user?.username).filter(Boolean))

  const [featuredCtoons, rankRows, topPointContributors, topRankMembers, captainMembers, poll] = await Promise.all([
    featuredCtoonsQuery,
    // Every OTHER cMoon's own current-members average, computed the exact same way as
    // thisAvgScore above (a CTE rather than reading teamScore, csl."cMoonId" = u."cMoonId" so a
    // row only counts toward the team it was actually earned for, no active/banned filter — see
    // that comment for why) — "joinLocked" = false mirrors the Leaderboards query's exclusion of
    // locked cMoons from the comparison set, so a locked team's average never shifts a visible
    // team's rank badge; this cMoon's own page still renders regardless of ITS OWN joinLocked
    // state, only the OTHER cMoons compared against are filtered. LEFT JOIN + COALESCE handles a
    // cMoon with no current-member CMoonScoreLog rows at all (average 0, same as the
    // "memberCount > 0" guard handles a cMoon with no members).
    db.$queryRaw`
      WITH current_totals AS (
        SELECT u."cMoonId", SUM(csl."points")::int AS total
        FROM "CMoonScoreLog" csl
        JOIN "User" u ON u."id" = csl."userId" AND u."cMoonId" = csl."cMoonId"
        WHERE u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
        GROUP BY u."cMoonId"
      )
      SELECT COUNT(*)::int AS count
      FROM "CMoon" c
      LEFT JOIN current_totals ct ON ct."cMoonId" = c.id
      WHERE c."memberCount" > 0 AND c."joinLocked" = false
        AND (COALESCE(ct.total, 0)::float8 / c."memberCount") > ${thisAvgScore}
    `,
    db.$queryRaw`
      SELECT u."username", u."avatar", SUM(csl."points")::int AS "points"
      FROM "CMoonScoreLog" csl
      JOIN "User" u ON u."id" = csl."userId" AND u."cMoonId" = ${id}
      WHERE csl."cMoonId" = ${id}
        AND u."active" = true
        AND COALESCE(u."banned", false) = false
        AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
      GROUP BY u."id", u."username", u."avatar"
      HAVING SUM(csl."points") > 0
      ORDER BY SUM(csl."points") DESC, u."username" ASC
      LIMIT ${LEADERBOARD_LIMIT}
    `,
    db.user.findMany({
      where: { cMoonId: id, active: true, banned: false, id: { not: EXCLUDED_SYSTEM_USER_ID }, currentCMoonRankId: { not: null } },
      orderBy: { currentCMoonRank: { sortOrder: 'desc' } },
      take: LEADERBOARD_LIMIT,
      select: { username: true, avatar: true, currentCMoonRank: { select: { name: true } } },
    }),
    // Every captain, regardless of their own tier's sortOrder (or even whether they've earned a
    // tier at all — displayRankName ignores rankName entirely when isCaptain is true, so no rank
    // data is needed for these rows). A tiny, bounded query (there are only ever a handful of
    // captains per cMoon) rather than dropping topRankMembers' own `take` limit and re-sorting a
    // whole roster, which for a large team could mean fetching and sorting far more rows just to
    // find captains that might not even be near the top by tier.
    captainUsernames.size
      ? db.user.findMany({
          where: { cMoonId: id, active: true, banned: false, id: { not: EXCLUDED_SYSTEM_USER_ID }, username: { in: [...captainUsernames] } },
          orderBy: { username: 'asc' },
          select: { username: true, avatar: true },
        })
      : Promise.resolve([]),
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

  // Captains pinned first (in the order captainMembers came back, username asc), then whoever
  // from the tier-ordered topRankMembers isn't already a captain, filling the rest of the list —
  // never changes anyone's actual rank/points, only where a captain's row sits in this one list.
  const mergedTopRankMembers = [
    ...captainMembers,
    ...topRankMembers.filter(u => !captainUsernames.has(u.username)),
  ].slice(0, LEADERBOARD_LIMIT)

  return {
    id: cmoon.id,
    name: cmoon.name,
    color: cmoon.color,
    pageBgColor: cmoon.pageBgColor,
    accentColor: cmoon.accentColor,
    textColor: cmoon.textColor,
    cardBgColor: cmoon.cardBgColor,
    pageBannerImagePath: cmoon.pageBannerImagePath,
    pageBannerWidth: cmoon.pageBannerWidth,
    pageBannerHeight: cmoon.pageBannerHeight,
    pageDescription: cmoon.pageDescription,
    featuredCtoons,
    memberCount: cmoon.memberCount,
    teamScore: cmoon.teamScore,
    rank: rankRows[0].count + 1,
    captains: [...captainUsernames],
    topPointContributors: topPointContributors.map(u => ({ username: u.username, avatar: u.avatar, points: u.points })),
    topRankMembers: mergedTopRankMembers.map(u => ({
      username: u.username,
      avatar: u.avatar,
      rankName: displayRankName(u.currentCMoonRank?.name, captainUsernames.has(u.username)) || '',
    })),
    poll: pollPayload,
  }
})
