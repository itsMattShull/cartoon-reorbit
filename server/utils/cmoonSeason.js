// server/utils/cmoonSeason.js
// Shared "current season" computation for the cMoon nav page's seasonal-updates section — live
// per-cMoon progress toward each admin-defined CMoonSeasonTracker, scoped to
// CMoonSeasonConfig.startedAt (see that model's own schema comment for why this is season-scoped
// rather than reading the lifetime running totals on CMoon itself). No caching, same stance
// server/api/leaderboard/cmoons.get.js takes for the same reason: cMoon count is small (tens),
// and this section is explicitly meant to show live numbers.
import { prisma } from '../prisma.js'

export const SEASON_CONFIG_ID = 'singleton'

export async function getSeasonConfig() {
  const cfg = await prisma.cMoonSeasonConfig.findUnique({ where: { id: SEASON_CONFIG_ID } })
  if (cfg) return cfg
  // Auto-provision on first read — no separate "enable this feature" admin step needed before
  // the section can render its (empty-tracker) defaults, same convention GlobalGameConfig
  // callers use for their own singleton row.
  return prisma.cMoonSeasonConfig.create({ data: { id: SEASON_CONFIG_ID } })
}

async function battleCounts(startedAt, outcome) {
  const rows = await prisma.cMoonEnemyBattle.groupBy({
    by: ['cMoonId'],
    where: { outcome, endedAt: { gte: startedAt } },
    _count: { _all: true },
  })
  return new Map(rows.map(r => [r.cMoonId, r._count._all]))
}

// Sum of CMoonScoreLog points since the season started — deliberately NOT current-membership
// scoped (unlike the leaderboard's avgScore, see that file's own comment on why IT restricts to
// current members): every point actually logged for a team this season counts toward its own
// season goal, same "whole log, no membership filter" convention recomputeCMoonTeamScores uses
// for the all-time teamScore column this mirrors a date-scoped version of.
async function seasonPointTotals(startedAt) {
  const rows = await prisma.cMoonScoreLog.groupBy({
    by: ['cMoonId'],
    where: { createdAt: { gte: startedAt } },
    _sum: { points: true },
  })
  return new Map(rows.map(r => [r.cMoonId, r._sum.points || 0]))
}

// Returns { config, trackers: [{ id, label, metricType, targetValue, progress: [{ cMoonId, name, color, value }] }] }.
// `trackers` is already filtered to active ones, ordered for display.
export async function computeSeasonProgress() {
  const [config, trackers, cmoons] = await Promise.all([
    getSeasonConfig(),
    prisma.cMoonSeasonTracker.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }),
    // Same "unlocked only" filter the team leaderboard uses (server/api/leaderboard/cmoons.get.js)
    // — a locked cMoon doesn't appear in team standings, so it doesn't get a season progress bar
    // either.
    prisma.cMoon.findMany({ where: { joinLocked: false }, select: { id: true, name: true, color: true, memberCount: true } }),
  ])

  if (!trackers.length) return { config, trackers: [] }

  const neededMetrics = new Set(trackers.map(t => t.metricType))
  const [wins, losses, points] = await Promise.all([
    neededMetrics.has('BATTLE_WINS') ? battleCounts(config.startedAt, 'WIN') : Promise.resolve(new Map()),
    neededMetrics.has('BATTLE_LOSSES') ? battleCounts(config.startedAt, 'LOSS') : Promise.resolve(new Map()),
    (neededMetrics.has('TEAM_SCORE') || neededMetrics.has('AVG_POINTS')) ? seasonPointTotals(config.startedAt) : Promise.resolve(new Map()),
  ])

  const valueFor = (metricType, cMoon) => {
    if (metricType === 'BATTLE_WINS') return wins.get(cMoon.id) || 0
    if (metricType === 'BATTLE_LOSSES') return losses.get(cMoon.id) || 0
    if (metricType === 'TEAM_SCORE') return points.get(cMoon.id) || 0
    // Plain average, no small-team shrinkage — see CMoonSeasonTrackerMetric's own schema comment
    // for why that leaderboard-ranking concern doesn't apply to a team's own goal.
    if (metricType === 'AVG_POINTS') return cMoon.memberCount > 0 ? (points.get(cMoon.id) || 0) / cMoon.memberCount : 0
    return 0
  }

  return {
    config,
    trackers: trackers.map(t => ({
      id: t.id,
      label: t.label,
      metricType: t.metricType,
      targetValue: t.targetValue,
      progress: cmoons.map(c => ({ cMoonId: c.id, name: c.name, color: c.color, value: valueFor(t.metricType, c) })),
    })),
  }
}
