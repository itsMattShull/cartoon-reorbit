// server/utils/cmoonSeasons.js
// Season resolution + live season-scoped computation for the cMoon nav page's seasonal section
// (components/newsite/CMoonNav.vue) and its admin management page
// (components/newsite/AdminManageNavigation.vue). Replaces the earlier single-current-season
// design (server/utils/cmoonSeason.js, a CMoonSeasonConfig singleton with only a `startedAt`) with
// real multi-row history — see the CMoonSeason model's own schema comment for the full rationale.
//
// No caching: every number here is computed fresh on each request, same stance the code it
// replaces already took (cMoon count is in the tens, season count is a handful — cheap at this
// scale, and these are exactly the numbers a nav page visitor expects to be live/current).
import { prisma } from '../prisma.js'

// The one season currently running, if any. At most one row can ever match this (admin-enforced
// non-overlap at the API layer — see assertNoOverlap below), so `findFirst` is safe without an
// explicit tie-break.
export async function getCurrentSeason() {
  const now = new Date()
  return prisma.cMoonSeason.findFirst({
    where: { startAt: { lte: now }, endAt: { gt: now } },
    include: { trackers: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
  })
}

// The soonest season that hasn't started yet, if any — powers the nav page's "countdown to next
// season" state when nothing is currently running.
export async function getNextSeason() {
  const now = new Date()
  return prisma.cMoonSeason.findFirst({
    where: { startAt: { gt: now } },
    orderBy: { startAt: 'asc' },
  })
}

// Every season whose end date has already passed, oldest first — powers the nav page's recap
// list ("Season 1 Recap", "Season 2 Recap", …).
export async function getPastSeasons() {
  const now = new Date()
  return prisma.cMoonSeason.findMany({
    where: { endAt: { lte: now } },
    orderBy: { seasonNumber: 'asc' },
  })
}

export async function listAllSeasons() {
  return prisma.cMoonSeason.findMany({
    orderBy: { seasonNumber: 'desc' },
    include: { trackers: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] } },
  })
}

// Rejects a [startAt, endAt) range that intersects any OTHER existing season (range overlap is a
// cross-row comparison, not expressible as a single-table DB constraint, so this is enforced here
// rather than at the schema level). `excludeId` lets an edit compare against every season except
// itself.
export async function assertNoOverlap(startAt, endAt, excludeId = null) {
  const conflict = await prisma.cMoonSeason.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { seasonNumber: true, startAt: true, endAt: true },
  })
  if (conflict) {
    const err = new Error(`Overlaps Season ${conflict.seasonNumber} (${conflict.startAt.toISOString()} – ${conflict.endAt.toISOString()})`)
    err.statusCode = 400
    throw err
  }
}

export async function nextSeasonNumber() {
  const top = await prisma.cMoonSeason.findFirst({ orderBy: { seasonNumber: 'desc' }, select: { seasonNumber: true } })
  return (top?.seasonNumber || 0) + 1
}

async function battleCountsBounded(startAt, endAt, outcome) {
  const rows = await prisma.cMoonEnemyBattle.groupBy({
    by: ['cMoonId'],
    where: { outcome, endedAt: { gte: startAt, lt: endAt } },
    _count: { _all: true },
  })
  return new Map(rows.map(r => [r.cMoonId, r._count._all]))
}

async function totalEnemiesDefeatedBounded(startAt, endAt) {
  return prisma.cMoonEnemyBattle.count({ where: { outcome: 'WIN', endedAt: { gte: startAt, lt: endAt } } })
}

async function seasonPointTotalsBounded(startAt, endAt) {
  const rows = await prisma.cMoonScoreLog.groupBy({
    by: ['cMoonId'],
    where: { createdAt: { gte: startAt, lt: endAt } },
    _sum: { points: true },
  })
  return new Map(rows.map(r => [r.cMoonId, r._sum.points || 0]))
}

// cMoons eligible to appear on any season-scoped board — same "unlocked only" filter the team
// leaderboard already uses (a locked cMoon doesn't appear in team standings at all).
async function unlockedCMoons() {
  return prisma.cMoon.findMany({ where: { joinLocked: false }, select: { id: true, name: true, color: true, memberCount: true } })
}

// Win/loss leaderboard for one season, bounded to [season.startAt, season.endAt) — see
// server/api/leaderboard/cmoons.get.js for the separate, UNCHANGED lifetime wtd-avg board used
// elsewhere on the site; this is specifically for the cMoon nav page's embedded panel.
// rate = wins/(wins+losses), 0 (not NaN) for a cMoon with no battles yet. Sorted by rate desc,
// then wins desc, then name — so a 0-battle cMoon still appears (rate 0%) rather than vanishing.
export async function seasonLeaderboard(season) {
  const [cmoons, wins, losses] = await Promise.all([
    unlockedCMoons(),
    battleCountsBounded(season.startAt, season.endAt, 'WIN'),
    battleCountsBounded(season.startAt, season.endAt, 'LOSS'),
  ])

  return cmoons
    .map(c => {
      const w = wins.get(c.id) || 0
      const l = losses.get(c.id) || 0
      const rate = (w + l) > 0 ? w / (w + l) : 0
      return { id: c.id, name: c.name, color: c.color, wins: w, losses: l, rate }
    })
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((c, i) => ({ ...c, rank: i + 1 }))
}

// Server-wide (not per-cMoon) top enemy-slayer for a season — adapted from the per-cMoon
// topSlayerForCMoon in server/utils/cmoonDiscordEvents.js (same WIN-count-by-userId shape, just
// without the cMoonId filter) for the season recap's "Season's top slayer" line.
export async function topSlayerOverall(startAt, endAt) {
  const rows = await prisma.cMoonEnemyBattle.groupBy({
    by: ['userId'],
    // raidId: null — same reasoning as topSlayerForCMoon's own comment in cmoonDiscordEvents.js:
    // this is a solo-kill-style callout ("Season's top slayer"), so a shared raid win (one
    // synthetic row per participant off a single kill) must not inflate it the way it legitimately
    // should for progression gates/achievements/team goals elsewhere.
    where: { outcome: 'WIN', raidId: null, endedAt: { gte: startAt, lt: endAt } },
    _count: { _all: true },
    // `orderBy: { _count: { _all: 'desc' } }` is rejected by this Prisma client version ("Unknown
    // argument `_all`") — order by a specific grouped field's count instead, same row-count value
    // since `by: ['userId']` with no null userId possible.
    orderBy: { _count: { userId: 'desc' } },
    take: 1,
  })
  if (!rows.length || !rows[0]._count._all) return null
  const user = await prisma.user.findUnique({ where: { id: rows[0].userId }, select: { username: true } })
  return { username: user?.username || 'Someone', wins: rows[0]._count._all }
}

// Full recap for one completed season: the winning cMoon (by this season's own win-rate
// leaderboard) and the season's top slayer — both bounded strictly to [startAt, endAt), so a
// season's recap numbers are fixed once it ends and never pick up a later season's battles.
export async function seasonRecap(season) {
  const [board, topSlayer] = await Promise.all([
    seasonLeaderboard(season),
    topSlayerOverall(season.startAt, season.endAt),
  ])
  const winningCMoon = board.find(c => c.wins + c.losses > 0) || null
  return {
    seasonNumber: season.seasonNumber,
    header: season.header,
    startAt: season.startAt,
    endAt: season.endAt,
    winningCMoon: winningCMoon ? { name: winningCMoon.name, color: winningCMoon.color, wins: winningCMoon.wins, losses: winningCMoon.losses, rate: winningCMoon.rate } : null,
    topSlayer,
  }
}

// Returns { enemiesGoal, trackers: [{ id, label, metricType, targetValue, progress: [...] }] } for
// one season — same shape the old computeSeasonProgress returned, now bounded to the season's own
// [startAt, endAt) window instead of an open-ended "since startedAt".
export async function computeSeasonProgress(season) {
  const trackers = season.trackers || []
  const cmoons = await unlockedCMoons()

  const enemiesGoal = {
    enabled: season.enemiesDefeatedGoalEnabled,
    label: season.enemiesDefeatedGoalLabel,
    target: season.enemiesDefeatedGoalTarget,
    current: season.enemiesDefeatedGoalEnabled ? await totalEnemiesDefeatedBounded(season.startAt, season.endAt) : 0,
  }

  if (!trackers.length) return { enemiesGoal, trackers: [] }

  const neededMetrics = new Set(trackers.map(t => t.metricType))
  const [wins, losses, points] = await Promise.all([
    neededMetrics.has('BATTLE_WINS') ? battleCountsBounded(season.startAt, season.endAt, 'WIN') : Promise.resolve(new Map()),
    neededMetrics.has('BATTLE_LOSSES') ? battleCountsBounded(season.startAt, season.endAt, 'LOSS') : Promise.resolve(new Map()),
    (neededMetrics.has('TEAM_SCORE') || neededMetrics.has('AVG_POINTS')) ? seasonPointTotalsBounded(season.startAt, season.endAt) : Promise.resolve(new Map()),
  ])

  const valueFor = (metricType, cMoon) => {
    if (metricType === 'BATTLE_WINS') return wins.get(cMoon.id) || 0
    if (metricType === 'BATTLE_LOSSES') return losses.get(cMoon.id) || 0
    if (metricType === 'TEAM_SCORE') return points.get(cMoon.id) || 0
    if (metricType === 'AVG_POINTS') return cMoon.memberCount > 0 ? (points.get(cMoon.id) || 0) / cMoon.memberCount : 0
    return 0
  }

  return {
    enemiesGoal,
    trackers: trackers.map(t => ({
      id: t.id,
      label: t.label,
      metricType: t.metricType,
      targetValue: t.targetValue,
      progress: cmoons.map(c => ({ cMoonId: c.id, name: c.name, color: c.color, value: valueFor(t.metricType, c) })),
    })),
  }
}
