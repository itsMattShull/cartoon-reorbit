// server/utils/cmoon.js
// Shared logic for the cMoon (faction) feature: atomic self-selection/opt-out, prize
// granting, and the daily team leaderboard scoring. Kept in one place so the feature
// is easy to rip out later — see GlobalGameConfig.cMoonEnabled.
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { mintQueue } from './queues.js'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart, getChicagoCalendarDayStart } from './dailyTaskWindows.js'
import { COMBAT_POOL_GAME_NAMES } from './gamePoints.js'
import { EXCLUDED_SYSTEM_USER_ID } from './economyValuation.js'
import { grantGuildRole, revokeGuildRole } from './discord.js'
import { CMOON_EFFECT_TYPES } from '../../utils/cmoonEffectTypes.js'
import { recomputeCMoonPointsForUsers } from '../cron/cmoon-points-aggregate.js'

// ── Daily cMoon team leaderboard scoring ──────────────────────────────────────
//
// Three bonuses, awarded once per calendar day (America/Chicago, at an admin-configurable
// time of day — see checkAndRunCMoonDailyScoring in server/cron/cmoon-daily-score.js and
// GlobalGameConfig.cMoonScoringRunHour/Minute) to whichever cMoon a qualifying player belongs to:
//   - HIGH_SCORE (default 100 pts/WEEK, i.e. ~14/day — see AWARDS_PER_WEEK below): holding rank
//     #1 (all-time) on an eligible arcade game.
//   - TOP10 (default 50 pts/week, ~7/day): a top-N finish on an eligible board (Top Points /
//     Total cToons).
//   - DAILY_TASK (default 10 pts/WEEK, ~2/day — see DAILY_TASK_AWARDS_PER_WEEK below):
//     completing at least one of the existing daily tasks that day. Awarded LIVE, directly
//     inside recordDailyTaskCompletions itself (run frequently — see
//     server/cron/record-daily-task-completions.js) the moment a completion is first detected,
//     rather than waiting for this once-daily job — see that function's own comment. This job's
//     DAILY_TASK handling below is a harmless backstop: the CMoonScoreLog unique constraint
//     means it can never double-award what was already credited live.
//
// This ran once a week (Monday) until admins asked for a fully time-adjustable daily run
// instead. HIGH_SCORE/TOP10 are a snapshot of who holds a spot RIGHT NOW, not something actually
// earned per-day — running that snapshot 7x as often would otherwise inflate an unchanged
// holder's weekly total 7x for no behavioral change, so those two admin-configured point values
// are still entered/read as "per week" and divided down at award time (see perRunAward), and stay
// on this job's admin-configurable once-daily cadence — never awarded live. DAILY_TASK genuinely
// already awards per calendar day (one completion = one award, no daily-cadence multiplication to
// correct for), but it's ALSO entered as a weekly total and divided down (see
// DAILY_TASK_AWARDS_PER_WEEK/dailyTaskAward below) — divided by 6 rather than 7, on the
// expectation that most players won't complete a qualifying task every single day of the week.
//
// All the numbers above, the minimum-account-age anti-abuse gate, which games are
// HIGH_SCORE-eligible, and which boards/rank-cutoff count for TOP10 are admin-editable
// (Admin > cMoons > Scoring Rules — see resolveScoringConfig below and
// server/api/admin/cmoon-scoring.post.js). Changes apply forward-only: they affect
// only future daily cron runs, never rewrite past CMoonScoreLog rows/teamScore.
//
// A minimum account age (default 3 days) gates all three: a brand-new throwaway account
// can join a cMoon and immediately inflate its score by camping a low-traffic game's #1
// spot or grinding the (cheap) daily tasks. Requiring the account to first survive N days
// raises the cost of that without adding new anti-abuse infrastructure.
//
// Awards are logged to CMoonScoreLog, whose unique constraint
// (cMoonId, userId, category, weekStart, detail) is the only idempotency guard
// needed — `createMany({ skipDuplicates: true })` can be re-run any number of
// times (retries, overlapping cron triggers) without ever double-crediting.
// CMoon.teamScore is never incremented directly; it is fully recomputed from
// CMoonScoreLog on every run (see recomputeCMoonTeamScores), so a crash mid-run
// can leave it briefly stale but never wrong or double-counted.

// Compile-time-constant game definitions — table/column names below are literal
// SQL text, never runtime/user input (mirrors the convention documented in
// server/utils/gameLeaderboard.js and server/utils/duelLeaderboard.js). Admin
// "disabled games" config (see resolveScoringConfig) only ever filters this array by
// `.name` — it must never be used to construct table/column identifiers itself.
const SCORE_GAMES = [
  { name: 'reorbitmatch', label: 'ReOrbit Match', table: 'ReOrbitMatchScore', column: 'score', direction: 'desc' },
  { name: 'tower', label: 'Tower Stack', table: 'TowerStackScore', column: 'score', direction: 'desc' },
  { name: 'reorbitmemory', label: 'ReOrbit Memory', table: 'ReOrbitMemoryScore', column: 'moves', direction: 'asc' },
  {
    name: 'guessctoon', label: 'Guess cToon', table: 'GuessCtoonScore', column: 'streak', direction: 'desc',
    extraWhere: 'AND s."suspicious" = false AND s."counted" = true'
  },
  { name: 'asteroid', label: 'Op. A.S.T.E.R.O.I.D.', table: 'AsteroidScore', column: 'score', direction: 'desc' },
  { name: 'flappy', label: 'Flappy Powerpuff', table: 'FlappyPowerpuffScore', column: 'score', direction: 'desc' },
  { name: 'fruitsamurai', label: 'Fruit Samurai', table: 'FruitSamuraiScore', column: 'score', direction: 'desc' },
]
const WIN_GAMES = [
  { name: 'edrps', label: 'Ed, Edd n Eddy RPS', table: 'EdRpsMatch' },
  { name: 'pokemonbattle', label: 'Pokemon: Fire, Water, Grass!', table: 'PokemonBattleMatch' },
]

// Read-only key/label lists for the admin UI's per-game eligibility toggles —
// never used to build SQL, only rendered and echoed back as `.name` filter values.
export const SCORE_GAME_OPTIONS = SCORE_GAMES.map(({ name, label }) => ({ key: name, label }))
export const WIN_GAME_OPTIONS = WIN_GAMES.map(({ name, label }) => ({ key: name, label }))

// Every category ever written to CMoonScoreLog.category — HIGH_SCORE/TOP10/DAILY_TASK from this
// file (see runDailyCMoonScoring/recordDailyTaskCompletions above), plus ADMIN_BACKFILL from
// server/workers/cmoon-daily-task-backfill.worker.js's one-time "Backfill cMoon Points" tool.
// Exported so the admin points-log endpoint has a fixed filter list without a DISTINCT query.
export const CMOON_SCORE_LOG_CATEGORIES = ['HIGH_SCORE', 'TOP10', 'DAILY_TASK', 'ADMIN_BACKFILL']

const GAME_LABEL_BY_KEY = new Map([...SCORE_GAMES, ...WIN_GAMES].map(g => [g.name, g.label]))

// Human-readable "how/where" for one CMoonScoreLog row, derived from its (category, detail)
// pair — see this file's various `candidates.push({ category, detail, ... })` call sites (and
// the backfill worker's `cMoonScoreLog.create`) for what each combination actually means.
// Exported so the admin points-log endpoint never has to re-derive this mapping itself.
export function describeCMoonScoreLogSource(category, detail) {
  switch (category) {
    case 'HIGH_SCORE':
      return `High Score — ${GAME_LABEL_BY_KEY.get(detail) || detail || 'unknown game'}`
    case 'TOP10':
      if (detail === 'points') return 'Top 10 — Total Points board'
      if (detail === 'totalCtoons') return 'Top 10 — Total cToons board'
      if (typeof detail === 'string' && detail.startsWith('game:')) {
        const key = detail.slice('game:'.length)
        return `Top 10 — ${GAME_LABEL_BY_KEY.get(key) || key}`
      }
      return 'Top 10'
    case 'DAILY_TASK':
      return 'Daily Task completion'
    case 'ADMIN_BACKFILL':
      return 'Admin backfill (Backfill cMoon Points tool)'
    default:
      return category || 'Unknown'
  }
}

// Defaults mirror the GlobalGameConfig column defaults (see the migration) — used both
// as the fallback when a value is missing/out-of-range and to document the shape.
export const CMOON_SCORING_DEFAULTS = {
  highScorePoints: 100,
  top10Points: 50,
  dailyTaskPoints: 10,
  minAccountAgeDays: 3,
  top10RankCutoff: 10,
  top10PointsBoardEnabled: true,
  top10CtoonsBoardEnabled: true,
}

// How many of the 7 days in a week a player is expected to complete a qualifying daily task —
// dailyTaskPoints is entered as a weekly total (same convention as highScorePoints/top10Points
// below) and divided by this to get the actual per-completion award. 6, not 7: unlike
// HIGH_SCORE/TOP10 (a snapshot re-taken daily that has to be divided down to avoid inflating an
// unchanged holder's total), a player who completes a daily task every single day of the week
// would otherwise cap out below the configured weekly figure under a ÷7 split — ÷6 leaves one
// rest day of headroom before that happens.
export const DAILY_TASK_AWARDS_PER_WEEK = 6
export function dailyTaskAward(weeklyPoints) {
  return Math.max(0, Math.round(weeklyPoints / DAILY_TASK_AWARDS_PER_WEEK))
}

function parseDisabledGameKeys(value) {
  if (!Array.isArray(value)) return []
  return value.filter(v => typeof v === 'string')
}

// Normalizes the cMoon-scoring columns on a GlobalGameConfig row into the values the
// weekly scorer and daily-task recorder actually use, falling back to
// CMOON_SCORING_DEFAULTS for anything missing or out of range (defends against a
// pre-migration row, a manually-edited DB value, etc. — the admin API is the only
// normal write path and already validates before storing).
// `activeScoreGames`/`activeWinGames` are the ONLY thing disabledScoreGames/disabledWinGames
// ever do: filter the compile-time SCORE_GAMES/WIN_GAMES arrays by `.name`. Admin-supplied
// strings must never be used for anything else (property lookups, SQL text, etc.) — see the
// module-level SCORE_GAMES/WIN_GAMES comment on why table/column identifiers must stay
// compile-time constants.
export function resolveScoringConfig(config) {
  const int = (v, fallback, min) => (Number.isInteger(v) && v >= min) ? v : fallback
  const disabledScoreGames = parseDisabledGameKeys(config?.cMoonDisabledScoreGames)
  const disabledWinGames = parseDisabledGameKeys(config?.cMoonDisabledWinGames)
  return {
    highScorePoints: int(config?.cMoonHighScorePoints, CMOON_SCORING_DEFAULTS.highScorePoints, 0),
    top10Points: int(config?.cMoonTop10Points, CMOON_SCORING_DEFAULTS.top10Points, 0),
    dailyTaskPoints: int(config?.cMoonDailyTaskPoints, CMOON_SCORING_DEFAULTS.dailyTaskPoints, 0),
    minAccountAgeDays: int(config?.cMoonScoringMinAccountAgeDays, CMOON_SCORING_DEFAULTS.minAccountAgeDays, 0),
    top10RankCutoff: int(config?.cMoonTop10RankCutoff, CMOON_SCORING_DEFAULTS.top10RankCutoff, 1),
    top10PointsBoardEnabled: config?.cMoonTop10PointsBoardEnabled !== false,
    top10CtoonsBoardEnabled: config?.cMoonTop10CtoonsBoardEnabled !== false,
    activeScoreGames: SCORE_GAMES.filter(g => !disabledScoreGames.includes(g.name)),
    activeWinGames: WIN_GAMES.filter(g => !disabledWinGames.includes(g.name)),
  }
}

// All-time top N for a score-based game (highest, or lowest for ReOrbit Memory's move count),
// one row per user. Shape/exclusions mirror server/utils/gameLeaderboard.js's buildTop11.
// `table`/`column` are compile-time constants from SCORE_GAMES above, never runtime input —
// same convention gameLeaderboard.js documents for the identical reason: they can't be bind
// parameters, so $queryRawUnsafe is used with every actual value (including rankCutoff) still
// bound. Backs both findTopScoreHolder (rankCutoff=1, for HIGH_SCORE) and the per-game TOP10
// award below (rankCutoff=top10RankCutoff) — the same "who's currently on this game's board"
// computation either way, just truncated at a different depth.
async function getTopNScoreHolders({ table, column, direction, extraWhere }, rankCutoff) {
  const agg = direction === 'asc' ? 'MIN' : 'MAX'
  const order = direction === 'asc' ? 'ASC' : 'DESC'
  const sql = `
    SELECT u."id" AS "userId", u."cMoonId" AS "cMoonId", u."createdAt" AS "createdAt"
    FROM "${table}" s
    JOIN "User" u ON u."id" = s."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> $1
      ${extraWhere || ''}
    GROUP BY u."id", u."cMoonId", u."createdAt"
    ORDER BY ${agg}(s."${column}") ${order}
    LIMIT $2
  `
  return prisma.$queryRawUnsafe(sql, EXCLUDED_SYSTEM_USER_ID, rankCutoff)
}
async function findTopScoreHolder(game) {
  const rows = await getTopNScoreHolders(game, 1)
  return rows[0] || null
}

// All-time top N by win count for a duel-match game, one row per user. Shape mirrors
// server/utils/duelLeaderboard.js's rankedRows (all-time period, natural endings only).
// `table` is a compile-time constant from WIN_GAMES above — see the note on getTopNScoreHolders.
// Backs findTopWinsHolder (rankCutoff=1) and the per-game TOP10 award the same way.
async function getTopNWinsHolders({ table }, rankCutoff) {
  const sql = `
    WITH participants AS (
      SELECT m."player1UserId" AS uid, (m."winnerUserId" = m."player1UserId") AS won
      FROM "${table}" m
      WHERE m."endedAt" IS NOT NULL AND m."endReason" = 'natural' AND m."player1UserId" <> m."player2UserId"
      UNION ALL
      SELECT m."player2UserId" AS uid, (m."winnerUserId" = m."player2UserId") AS won
      FROM "${table}" m
      WHERE m."endedAt" IS NOT NULL AND m."endReason" = 'natural' AND m."player1UserId" <> m."player2UserId"
    ),
    agg AS (
      SELECT uid, COUNT(*) FILTER (WHERE won)::int AS wins
      FROM participants
      WHERE uid <> $1
      GROUP BY uid
    )
    SELECT u."id" AS "userId", u."cMoonId" AS "cMoonId", u."createdAt" AS "createdAt"
    FROM agg a
    JOIN "User" u ON u."id" = a.uid
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND a.wins > 0
    ORDER BY a.wins DESC
    LIMIT $2
  `
  return prisma.$queryRawUnsafe(sql, EXCLUDED_SYSTEM_USER_ID, rankCutoff)
}
async function findTopWinsHolder(game) {
  const rows = await getTopNWinsHolders(game, 1)
  return rows[0] || null
}

// Top N of the public "Top Points" board (server/api/points-leaderboard.get.js),
// membership/age-filtered later — ranking itself must reflect the real board, not just
// cMoon members, or a small/inactive cMoon's top N would mean nothing. `rankCutoff` is
// bound as an ordinary query parameter (a LIMIT value, not an identifier), so it's safe
// to come from admin config the same way any other numeric column value would be.
async function getTop10PointsHolders(rankCutoff) {
  return prisma.$queryRaw`
    SELECT u."id" AS "userId", u."cMoonId" AS "cMoonId", u."createdAt" AS "createdAt"
    FROM "UserPoints" up
    JOIN "User" u ON u."id" = up."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
    ORDER BY up."points" DESC, u."username" ASC
    LIMIT ${rankCutoff}
  `
}

// Top N of the public "Total cToons" board (server/api/leaderboard/total-ctoons.get.js).
async function getTop10TotalCtoonsHolders(rankCutoff) {
  return prisma.$queryRaw`
    SELECT u."id" AS "userId", u."cMoonId" AS "cMoonId", u."createdAt" AS "createdAt"
    FROM "User" u
    JOIN "UserCtoon" uc ON uc."userId" = u."id"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
      AND uc."burnedAt" IS NULL
    GROUP BY u."id", u."cMoonId", u."createdAt"
    ORDER BY COUNT(uc."id") DESC, u."username" ASC
    LIMIT ${rankCutoff}
  `
}

// A holder row is eligible for a cMoon-score award if it belongs to a cMoon and the
// account has survived the minimum age gate (see resolveScoringConfig above).
function isEligibleHolder(row, minAccountAgeCutoff) {
  return !!(row?.cMoonId && new Date(row.createdAt) <= minAccountAgeCutoff)
}
function eligibleHolders(rows, minAccountAgeCutoff) {
  return (rows || []).filter(r => isEligibleHolder(r, minAccountAgeCutoff))
}

// Set-based daily task completion check, restricted to current cMoon members past the
// minimum account age gate. Mirrors the 7 status checks in server/api/onboarding/daily.get.js
// exactly (same boundaries, same thresholds) so a player's onboarding checklist and this job
// can never silently disagree about whether "today" was completed. Runs frequently (see
// server/cron/record-daily-task-completions.js) rather than once daily: the underlying tasks
// reset at two different times (8pm Chicago for most, 8am for Winwheel/Lotto/monster scans),
// so a single daily run would leave a window where 8am-boundary activity could go unrecorded —
// and, since DAILY_TASK points below are now awarded live off each newly-detected completion,
// running this often is also what makes a player's rank bar feel like it updates in real time.
// Idempotent either way — UserDailyTaskCompletion is unique on (userId, date).
// `dailyBoundary`/`morningBoundary` default to the CURRENT boundaries (the live per-minute
// cron's own behavior, unchanged) but can be overridden to re-run this exact detection logic
// against a PAST pair of boundaries instead — see the daily-task backfill tool
// (server/api/admin/cmoons/backfill-daily-tasks.post.js), which reuses this function rather than
// re-implementing its SQL, for catching up on completions the live cron missed while it wasn't
// running. `writeHeartbeat: false` is passed by that tool: the heartbeat exists to tell an admin
// "the live per-minute cron is still actually running" (see cMoonDailyTaskCronLastRanAt's schema
// comment) — stamping it from an admin-triggered backfill would mask a real outage by making the
// cron look healthy when it wasn't the one that ran.
export async function recordDailyTaskCompletions({
  dailyBoundary: dailyBoundaryOverride,
  morningBoundary: morningBoundaryOverride,
  writeHeartbeat = true,
  skipRecompute = false,
} = {}) {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) return { recorded: 0 }

  if (writeHeartbeat) {
    // Heartbeat: stamped every tick this cron actually runs, regardless of whether anyone
    // qualified — see the schema comment on cMoonDailyTaskCronLastRanAt. Fire-and-forget: this
    // must never slow down or fail the real work below over a heartbeat write.
    prisma.globalGameConfig
      .update({ where: { id: 'singleton' }, data: { cMoonDailyTaskCronLastRanAt: new Date() } })
      .then(() => invalidateGlobalConfigCache())
      .catch(() => {})
  }

  const [globalConfig, winwheelConfig, lottoSettings, barcodeConfig] = await Promise.all([
    prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true, tkoDailyPointLimit: true, czoneVisitMaxPerDay: true }
    }),
    prisma.gameConfig.findUnique({ where: { gameName: 'Winwheel' }, select: { maxDailySpins: true } }),
    prisma.lottoSettings.findUnique({ where: { id: 'lotto' }, select: { countPerDay: true } }),
    prisma.barcodeGameConfig.findFirst({
      where: { isActive: true }, orderBy: { createdAt: 'desc' }, select: { monsterDailyScanLimit: true }
    }),
  ])

  const czoneVisitMaxPerDay = Number(globalConfig?.czoneVisitMaxPerDay ?? 10)
  const dailyPointLimit = Number(globalConfig?.dailyPointLimit ?? 250)
  const tkoDailyPointLimit = Number(globalConfig?.tkoDailyPointLimit ?? 250)
  const winwheelMaxDailySpins = Number(winwheelConfig?.maxDailySpins ?? 0)
  const lottoCountPerDay = Number(lottoSettings?.countPerDay ?? 0)
  const monsterDailyScanLimit = Number(barcodeConfig?.monsterDailyScanLimit ?? 0)

  const dailyBoundary = dailyBoundaryOverride ?? getChicagoDailyBoundary()
  const morningBoundary = morningBoundaryOverride ?? getChicagoMorningWindowStart()
  // Only the LIVE call (no explicit boundary passed in) ever has "now" fall inside these two
  // windows — a historical call (the backfill tool) is always re-checking a day that has already
  // fully elapsed. Every append-only-log branch below gets an explicit end bound of boundary+24h
  // for exactly this reason: with no end bound, "createdAt >= boundary" alone is harmless for the
  // live call (nothing has a future createdAt, so it's equivalent to "since boundary, through
  // now") but silently means "since boundary, through RIGHT NOW" for a historical call too — i.e.
  // every day *since* that boundary, not just the one day it names. A user who was merely active
  // TODAY would then satisfy every past boundary the backfill tool re-checks, and get awarded for
  // days they did nothing on. The end bound makes both calls check exactly one real day, live or not.
  const isHistorical = Boolean(dailyBoundaryOverride || morningBoundaryOverride)
  const ONE_DAY_MS = 24 * 60 * 60 * 1000
  const dailyBoundaryEnd = new Date(dailyBoundary.getTime() + ONE_DAY_MS)
  const morningBoundaryEnd = new Date(morningBoundary.getTime() + ONE_DAY_MS)
  const { minAccountAgeDays, dailyTaskPoints } = resolveScoringConfig(config)
  const minAccountAgeCutoff = new Date(Date.now() - minAccountAgeDays * 24 * 60 * 60 * 1000)
  const combatNames = Prisma.join(COMBAT_POOL_GAME_NAMES)

  // daily.get.js only ever treats a threshold-based task as completable when its configured
  // limit is > 0 (an admin-set 0 means "no cap configured", not "impossible to complete") —
  // every branch below mirrors that exactly, falling back to an inert always-empty branch.
  const inert = Prisma.sql`SELECT NULL::text AS "userId" WHERE FALSE`
  const czoneBranch = czoneVisitMaxPerDay > 0
    ? Prisma.sql`
        SELECT "userId" FROM "PointsLog"
        WHERE "method" = 'cZone Visit' AND "createdAt" >= ${dailyBoundary} AND "createdAt" < ${dailyBoundaryEnd}
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING COUNT(*) >= ${czoneVisitMaxPerDay}`
    : inert
  const gameptsBranch = dailyPointLimit > 0
    ? Prisma.sql`
        SELECT "userId" FROM "GamePointLog"
        WHERE "createdAt" >= ${dailyBoundary} AND "createdAt" < ${dailyBoundaryEnd}
          AND ("gameName" IS NULL OR "gameName" NOT IN (${combatNames}))
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING SUM("points") >= ${dailyPointLimit}`
    : inert
  const tkoptsBranch = tkoDailyPointLimit > 0
    ? Prisma.sql`
        SELECT "userId" FROM "GamePointLog"
        WHERE "createdAt" >= ${dailyBoundary} AND "createdAt" < ${dailyBoundaryEnd}
          AND "gameName" IN (${combatNames})
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING SUM("points") >= ${tkoDailyPointLimit}`
    : inert
  const wheelBranch = winwheelMaxDailySpins > 0
    ? Prisma.sql`
        SELECT "userId" FROM "WheelSpinLog"
        WHERE "createdAt" >= ${morningBoundary} AND "createdAt" < ${morningBoundaryEnd}
          AND "status" <> 'failed' AND "result" <> 'tripleNothing'
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING COUNT(*) >= ${winwheelMaxDailySpins}`
    : inert
  // lotto/scans can only ever be checked LIVE, never backfilled: LottoUser.purchasesToday and
  // UserBarcodeScan.lastScannedAt are both current-state columns upserted in place on every new
  // purchase/scan (LottoUser has one row per user; UserBarcodeScan is unique on (userId,
  // mappingId)), not append-only logs — a later purchase/scan overwrites the very value a
  // historical boundary would need to check, so there is no way to reconstruct "did this user
  // qualify on that past day" from either table once time has moved on. Forcing both inert
  // whenever a historical boundary is passed in avoids crediting (or wrongly denying) a past day
  // using data that actually reflects a totally different, more recent day.
  const lottoBranch = lottoCountPerDay > 0 && !isHistorical
    ? Prisma.sql`
        SELECT "userId" FROM "LottoUser"
        WHERE "lastReset" >= ${morningBoundary} AND "purchasesToday" >= ${lottoCountPerDay}
          AND "userId" IN (SELECT id FROM eligible)`
    : inert
  const scansBranch = monsterDailyScanLimit > 0 && !isHistorical
    ? Prisma.sql`
        SELECT "userId" FROM "UserBarcodeScan"
        WHERE "lastScannedAt" >= ${morningBoundary}
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING COUNT(*) >= ${monsterDailyScanLimit}`
    : inert

  // Two separate qualifying groups, each recorded under ITS OWN boundary as the completion
  // "date" — login/czone/gamepts/tkopts reset at 8pm (dailyBoundary), wheel/lotto/scans reset
  // at 8am (morningBoundary). Recording every group under one shared date used to let the two
  // clocks drift apart: a player who qualified via wheel/lotto/scans earlier in the day was
  // still "qualifying" (their cumulative count doesn't disappear) once dailyBoundary rolled
  // over at 8pm, so the very same activity could insert a second, distinct-date completion row
  // a few minutes after 8pm — a real double-award, not a hypothetical, hit by any player doing
  // those three tasks during normal daytime hours. Recording each group under its own boundary
  // means a row only becomes insertable again once that group's OWN reset actually happens.
  //
  // A player who satisfies both groups in the same real day now gets two completion rows (one
  // per boundary) rather than one — an accepted, much narrower trade-off: two genuinely
  // independent reset cycles being satisfied, instead of one activity being double-counted.
  const rows = await prisma.$queryRaw`
    WITH eligible AS (
      SELECT id FROM "User"
      WHERE "cMoonId" IS NOT NULL AND "createdAt" <= ${minAccountAgeCutoff}
        AND "active" = true AND COALESCE("banned", false) = false
    ),
    login AS (
      SELECT DISTINCT "userId" FROM "PointsLog"
      WHERE "method" = 'Daily Login' AND "createdAt" >= ${dailyBoundary} AND "createdAt" < ${dailyBoundaryEnd}
        AND "userId" IN (SELECT id FROM eligible)
    ),
    czone AS (${czoneBranch}),
    gamepts AS (${gameptsBranch}),
    tkopts AS (${tkoptsBranch}),
    wheel AS (${wheelBranch}),
    lotto AS (${lottoBranch}),
    scans AS (${scansBranch}),
    eveningQualifying AS (
      SELECT "userId" FROM login
      UNION SELECT "userId" FROM czone
      UNION SELECT "userId" FROM gamepts
      UNION SELECT "userId" FROM tkopts
    ),
    morningQualifying AS (
      SELECT "userId" FROM wheel
      UNION SELECT "userId" FROM lotto
      UNION SELECT "userId" FROM scans
    )
    INSERT INTO "UserDailyTaskCompletion" (id, "userId", "date")
    SELECT gen_random_uuid()::text, "userId", ${dailyBoundary} FROM eveningQualifying
    UNION ALL
    SELECT gen_random_uuid()::text, "userId", ${morningBoundary} FROM morningQualifying
    ON CONFLICT ("userId", "date") DO NOTHING
    RETURNING id, "userId", "date"
  `

  // Live-award DAILY_TASK the moment a completion is first detected, rather than waiting for
  // runDailyCMoonScoring's own once-daily pass (see that function's comment) — every row here
  // is a brand-new UserDailyTaskCompletion row (ON CONFLICT DO NOTHING excludes already-recorded
  // ones), so this can never re-award the same (user, boundary) twice on its own; the
  // CMoonScoreLog unique constraint (cMoonId, userId, category, weekStart, detail) is still the
  // actual idempotency guard, exactly as it is everywhere else in this module. Each row's own
  // `date` (not a single shared value) becomes that award's weekStart/detail, matching whichever
  // boundary actually produced it.
  //
  // A historical (backfilled) award is attributed using the member's CURRENT cMoinId/eligibility,
  // not whatever they were on the day being backfilled — this module has no membership-history
  // table to look up "what team was this user on, X days ago" from. In practice this only
  // matters for a user who switched teams (or joined/left) in the narrow gap between the missed
  // day and the backfill running, and the live cron carries the exact same limitation for its own
  // (much smaller, minutes-wide) gap between an activity and the cron tick that records it.
  let awardedUserIds = []
  if (dailyTaskPoints > 0 && rows.length) {
    const newUserIds = rows.map(r => r.userId)
    const members = await prisma.user.findMany({
      where: { id: { in: newUserIds }, cMoonId: { not: null } },
      select: { id: true, cMoonId: true },
    })
    if (members.length) {
      const cMoonIdByUser = new Map(members.map(m => [m.id, m.cMoonId]))
      const awardPoints = dailyTaskAward(dailyTaskPoints)
      const candidates = rows
        .filter(r => cMoonIdByUser.has(r.userId))
        .map(r => ({
          cMoonId: cMoonIdByUser.get(r.userId), userId: r.userId, category: 'DAILY_TASK',
          detail: r.date.toISOString(), points: awardPoints, weekStart: r.date,
        }))
      await prisma.cMoonScoreLog.createMany({ data: candidates, skipDuplicates: true })
      awardedUserIds = members.map(u => u.id)
      // skipRecompute: true lets a caller doing several passes in one request (the backfill tool,
      // one pass per day) defer both of these to a single call at the end instead of once per
      // pass — recomputeCMoonTeamScores in particular recomputes teamScore for every cMoon from
      // the WHOLE CMoonScoreLog table each time it runs, so paying that cost N times in one
      // request when N-1 of them are immediately superseded by the next pass's recompute is pure
      // waste, and only gets more expensive as CMoonScoreLog grows with the user base.
      if (!skipRecompute) {
        await recomputeCMoonTeamScores()
        await recomputeCMoonPointsForUsers(awardedUserIds)
      }
    }
  }

  return { recorded: rows.length, awardedUserIds }
}

// Fully recomputes CMoon.teamScore from CMoonScoreLog (never incremented directly — see
// the module-level comment above). Two-statement reset-then-recompute, both in one
// transaction, mirrors server/cron/czone-display-count.js's runCzoneDisplayCountAggregate.
export async function recomputeCMoonTeamScores() {
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "CMoon" SET "teamScore" = 0`,
    prisma.$executeRaw`
      UPDATE "CMoon" c SET "teamScore" = totals.total
      FROM (
        SELECT "cMoonId", SUM("points")::int AS total
        FROM "CMoonScoreLog"
        GROUP BY "cMoonId"
      ) totals
      WHERE c.id = totals."cMoonId"
    `,
  ])
}

// Daily checker-cron entry point (server/cron/cmoon-daily-score.js). Gathers every qualifying
// award for the calendar day that just ended, bulk-inserts them (idempotent via the unique
// constraint), then recomputes every cMoon's teamScore from the log. Safe to re-run.
//
// HIGH_SCORE and TOP10 are a snapshot of "who holds this spot right now" — previously taken
// once a week, they're divided by 7 (rounded) here since moving to a daily cadence means an
// unchanged holder is now snapshotted 7x as often, and weekly point totals would otherwise
// balloon 7x for no behavioral change. DAILY_TASK is untouched: it already awarded once per
// calendar day (just batched into one weekly run before), so its cadence hasn't actually changed.
const AWARDS_PER_WEEK = 7
function perRunAward(weeklyPoints) {
  return Math.max(0, Math.round(weeklyPoints / AWARDS_PER_WEEK))
}

export async function runDailyCMoonScoring() {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) return { awarded: 0 }

  const {
    highScorePoints, top10Points, dailyTaskPoints, minAccountAgeDays, top10RankCutoff,
    top10PointsBoardEnabled, top10CtoonsBoardEnabled, activeScoreGames, activeWinGames,
  } = resolveScoringConfig(config)
  const dailyHighScorePoints = perRunAward(highScorePoints)
  const dailyTop10Points = perRunAward(top10Points)
  const dailyTaskAwardPoints = dailyTaskAward(dailyTaskPoints)

  // Chicago-midnight, NOT getChicagoDailyBoundary's hardcoded 8pm — see getChicagoCalendarDayStart's
  // own comment for why: that function is pinned to the DAILY_TASK reset clock, unrelated to (and
  // capable of silently colliding with) this job's own admin-configurable run time.
  const weekStart = getChicagoCalendarDayStart()
  const weekBegin = new Date(weekStart.getTime() - 24 * 60 * 60 * 1000)
  const weekEnd = new Date(weekStart.getTime() + 24 * 60 * 60 * 1000)
  const minAccountAgeCutoff = new Date(Date.now() - minAccountAgeDays * 24 * 60 * 60 * 1000)

  const candidates = []

  // Top N (not just #1) per eligible game, fetched once and reused for both categories: row 0
  // is this game's HIGH_SCORE holder (unchanged behavior), and every eligible row in the full
  // list earns TOP10 for placing in this game's own top `top10RankCutoff` — the same games list
  // (activeScoreGames/activeWinGames, admin-editable via the existing per-game disable toggles)
  // as HIGH_SCORE, just a deeper cut. #1 naturally earns both categories for the same game,
  // same as it already could for, say, HIGH_SCORE plus a Top Points board finish.
  const [scoreTopN, winTopN, top10PointsHolders, top10CtoonsHolders] = await Promise.all([
    Promise.all(activeScoreGames.map(g => getTopNScoreHolders(g, top10RankCutoff))),
    Promise.all(activeWinGames.map(g => getTopNWinsHolders(g, top10RankCutoff))),
    top10PointsBoardEnabled ? getTop10PointsHolders(top10RankCutoff) : Promise.resolve([]),
    top10CtoonsBoardEnabled ? getTop10TotalCtoonsHolders(top10RankCutoff) : Promise.resolve([]),
  ])

  activeScoreGames.forEach((g, i) => {
    const rows = scoreTopN[i]
    const holder = rows[0] || null
    if (isEligibleHolder(holder, minAccountAgeCutoff)) {
      candidates.push({ cMoonId: holder.cMoonId, userId: holder.userId, category: 'HIGH_SCORE', detail: g.name, points: dailyHighScorePoints, weekStart })
    }
    for (const row of eligibleHolders(rows, minAccountAgeCutoff)) {
      candidates.push({ cMoonId: row.cMoonId, userId: row.userId, category: 'TOP10', detail: `game:${g.name}`, points: dailyTop10Points, weekStart })
    }
  })
  activeWinGames.forEach((g, i) => {
    const rows = winTopN[i]
    const holder = rows[0] || null
    if (isEligibleHolder(holder, minAccountAgeCutoff)) {
      candidates.push({ cMoonId: holder.cMoonId, userId: holder.userId, category: 'HIGH_SCORE', detail: g.name, points: dailyHighScorePoints, weekStart })
    }
    for (const row of eligibleHolders(rows, minAccountAgeCutoff)) {
      candidates.push({ cMoonId: row.cMoonId, userId: row.userId, category: 'TOP10', detail: `game:${g.name}`, points: dailyTop10Points, weekStart })
    }
  })
  for (const row of eligibleHolders(top10PointsHolders, minAccountAgeCutoff)) {
    candidates.push({ cMoonId: row.cMoonId, userId: row.userId, category: 'TOP10', detail: 'points', points: dailyTop10Points, weekStart })
  }
  for (const row of eligibleHolders(top10CtoonsHolders, minAccountAgeCutoff)) {
    candidates.push({ cMoonId: row.cMoonId, userId: row.userId, category: 'TOP10', detail: 'totalCtoons', points: dailyTop10Points, weekStart })
  }

  // Extra guard on top of the (cMoonId, userId, category, weekStart, detail) unique constraint,
  // covering HIGH_SCORE/TOP10 only (DAILY_TASK already has its own per-row dedup via
  // UserDailyTaskCompletion, untouched below): makes this function safe to invoke more than once
  // on the same Chicago calendar day — e.g. an admin manually re-running it to backfill whatever
  // a bad run time skipped — without double-awarding anyone already credited earlier today, by
  // checking actual createdAt rather than trusting weekStart to be a fresh value.
  const alreadyToday = await prisma.cMoonScoreLog.findMany({
    where: { createdAt: { gte: weekStart, lt: weekEnd }, category: { in: ['HIGH_SCORE', 'TOP10'] } },
    select: { cMoonId: true, userId: true, category: true, detail: true },
  })
  const alreadyTodayKeys = new Set(alreadyToday.map(r => `${r.cMoonId}|${r.userId}|${r.category}|${r.detail}`))
  const newCandidates = candidates.filter(c => !alreadyTodayKeys.has(`${c.cMoonId}|${c.userId}|${c.category}|${c.detail}`))
  candidates.length = 0
  candidates.push(...newCandidates)

  // weekStart here is deliberately row.date, not the outer weekStart — a completion recorded
  // under morningBoundary (wheel/lotto/scans, see recordDailyTaskCompletions) must produce the
  // exact same (weekStart, detail) pair here as it would have from the live-award path, or the
  // CMoonScoreLog unique constraint stops deduping it and this backstop double-awards it.
  const dailyTaskRows = await prisma.userDailyTaskCompletion.findMany({
    where: { date: { gte: weekBegin, lt: weekStart }, user: { cMoonId: { not: null } } },
    select: { userId: true, date: true, user: { select: { cMoonId: true } } }
  })
  for (const row of dailyTaskRows) {
    candidates.push({
      cMoonId: row.user.cMoonId, userId: row.userId, category: 'DAILY_TASK',
      detail: row.date.toISOString(), points: dailyTaskAwardPoints, weekStart: row.date
    })
  }

  if (candidates.length) {
    await prisma.cMoonScoreLog.createMany({ data: candidates, skipDuplicates: true })
  }
  await recomputeCMoonTeamScores()
  // Team score above covers the team-wide leaderboard, but a member's own "Your Rank" progress
  // bar reads User.cMoonPoints specifically (see rank-progress.get.js) — without this, a HIGH_
  // SCORE/TOP10 award here would only reach that field via the separate, up-to-15-minute
  // runCMoonPointsAggregate sweep, which is exactly what made a manual "Re-run Scoring Now"
  // catch-up look like it hadn't worked (team total updated instantly, personal bar didn't).
  // DAILY_TASK's own live-award path already does this same thing for its own awards; this
  // mirrors it here so every category updates a member's personal total immediately.
  if (candidates.length) {
    await recomputeCMoonPointsForUsers([...new Set(candidates.map(c => c.userId))])
  }

  return { awarded: candidates.length }
}

// ── Live scoring preview (for the "Your Rank" progress bar) ────────────────────────────
//
// Shows a member "if the daily leaderboard job ran right now, what would I earn" — NOT a
// commitment. Covers ONLY HIGH_SCORE/TOP10 (the two snapshot-based, admin-configured-as-weekly
// categories that genuinely still wait for runDailyCMoonScoring's once-a-day run, see that
// function's comment) — DAILY_TASK is deliberately excluded here since it's now awarded live,
// directly inside recordDailyTaskCompletions, the moment a completion is first detected, so it's
// already reflected in cMoonPoints itself by the time this preview would otherwise show it as
// pending. Nothing here is ever written to CMoonScoreLog; standings can still change before the
// real job actually runs, so the UI consuming this must present it as pending/estimated, never
// as already-earned points.
//
// Reuses the SAME holder-finding queries runDailyCMoonScoring uses (so the preview can never
// drift from what the real job would actually award), but batches them behind a short-TTL
// shared cache rather than re-running per request: this preview is read on every cMoon page
// view by every member (server/api/cmoon/[id]/rank-progress.get.js), orders of magnitude more
// often than the real job runs, and each "who currently holds #1/top-10" computation is the
// same handful of queries the once-a-day job pays for — fine once a day, not fine per page view.
let cachedHolderSnapshot = null
let cachedHolderSnapshotAt = 0
const HOLDER_SNAPSHOT_TTL_MS = 60_000

async function getHolderSnapshot() {
  const now = Date.now()
  if (cachedHolderSnapshot && (now - cachedHolderSnapshotAt) < HOLDER_SNAPSHOT_TTL_MS) return cachedHolderSnapshot

  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) {
    cachedHolderSnapshot = { resolvedConfig: null }
    cachedHolderSnapshotAt = now
    return cachedHolderSnapshot
  }

  const resolvedConfig = resolveScoringConfig(config)
  const { activeScoreGames, activeWinGames, top10PointsBoardEnabled, top10CtoonsBoardEnabled, top10RankCutoff } = resolvedConfig

  const [scoreTopN, winTopN, top10PointsHolders, top10CtoonsHolders] = await Promise.all([
    Promise.all(activeScoreGames.map(g => getTopNScoreHolders(g, top10RankCutoff))),
    Promise.all(activeWinGames.map(g => getTopNWinsHolders(g, top10RankCutoff))),
    top10PointsBoardEnabled ? getTop10PointsHolders(top10RankCutoff) : Promise.resolve([]),
    top10CtoonsBoardEnabled ? getTop10TotalCtoonsHolders(top10RankCutoff) : Promise.resolve([]),
  ])

  cachedHolderSnapshot = { resolvedConfig, activeScoreGames, activeWinGames, scoreTopN, winTopN, top10PointsHolders, top10CtoonsHolders }
  cachedHolderSnapshotAt = now
  return cachedHolderSnapshot
}

// Mainly for tests/admin tooling — the 60s TTL alone keeps this fresh enough for the UI.
export function invalidateHolderSnapshotCache() {
  cachedHolderSnapshot = null
  cachedHolderSnapshotAt = 0
}

// `userCreatedAt` is passed in (rather than re-queried) since the caller already has it from
// the same User row it loaded for isMember/cMoonPoints.
export async function getPendingScoringPreview(userId, cMoonId, userCreatedAt) {
  const empty = { pendingPoints: 0, breakdown: [] }
  const snapshot = await getHolderSnapshot()
  if (!snapshot.resolvedConfig) return empty

  const { highScorePoints, top10Points, minAccountAgeDays } = snapshot.resolvedConfig
  const minAccountAgeCutoff = new Date(Date.now() - minAccountAgeDays * 24 * 60 * 60 * 1000)
  if (new Date(userCreatedAt) > minAccountAgeCutoff) return empty // same anti-abuse gate as the real job

  const dailyHighScorePoints = perRunAward(highScorePoints)
  const dailyTop10Points = perRunAward(top10Points)
  // `detail` mirrors exactly what runDailyCMoonScoring would write for the same holder (see its
  // own candidates.push(...) calls) — needed below to check what's already been credited today,
  // stripped from the returned breakdown afterward since callers only ever cared about label.
  let breakdown = []

  const isThisUser = (row) => row?.userId === userId && row?.cMoonId === cMoonId

  snapshot.activeScoreGames.forEach((g, i) => {
    const rows = snapshot.scoreTopN[i]
    if (isThisUser(rows[0])) breakdown.push({ category: 'HIGH_SCORE', detail: g.name, label: g.label, points: dailyHighScorePoints })
    if (rows.some(isThisUser)) breakdown.push({ category: 'TOP10', detail: `game:${g.name}`, label: `${g.label} leaderboard`, points: dailyTop10Points })
  })
  snapshot.activeWinGames.forEach((g, i) => {
    const rows = snapshot.winTopN[i]
    if (isThisUser(rows[0])) breakdown.push({ category: 'HIGH_SCORE', detail: g.name, label: g.label, points: dailyHighScorePoints })
    if (rows.some(isThisUser)) breakdown.push({ category: 'TOP10', detail: `game:${g.name}`, label: `${g.label} leaderboard`, points: dailyTop10Points })
  })
  if (snapshot.top10PointsHolders.some(isThisUser)) {
    breakdown.push({ category: 'TOP10', detail: 'points', label: 'Total Points board', points: dailyTop10Points })
  }
  if (snapshot.top10CtoonsHolders.some(isThisUser)) {
    breakdown.push({ category: 'TOP10', detail: 'totalCtoons', label: 'Total cToons board', points: dailyTop10Points })
  }

  // Drop anything already credited TODAY — otherwise this preview keeps claiming a spot is
  // "pending" (implying more points are still coming) even after the real award already landed
  // and is sitting in cMoonPoints, which is exactly what made a just-completed catch-up run look
  // like nothing had happened.
  if (breakdown.length) {
    const todayStart = getChicagoCalendarDayStart()
    const alreadyToday = await prisma.cMoonScoreLog.findMany({
      where: { userId, cMoonId, category: { in: ['HIGH_SCORE', 'TOP10'] }, createdAt: { gte: todayStart } },
      select: { category: true, detail: true },
    })
    const alreadyKeys = new Set(alreadyToday.map(r => `${r.category}|${r.detail}`))
    breakdown = breakdown.filter(b => !alreadyKeys.has(`${b.category}|${b.detail}`))
  }

  const pendingPoints = breakdown.reduce((sum, b) => sum + b.points, 0)
  return { pendingPoints, breakdown: breakdown.map(({ category, label, points }) => ({ category, label, points })) }
}

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
export const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/

export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value)
}

export function isValidDiscordSnowflake(value) {
  return typeof value === 'string' && DISCORD_SNOWFLAKE_RE.test(value)
}

// Allow-list checked before any value reaches Prisma, matching the isValidHexColor /
// isValidDiscordSnowflake convention above — an invalid enum value should fail with a clean 400
// here, not surface as an unhandled Prisma validation error from the write itself. Imported from
// utils/cmoonEffectTypes.js (the single source of truth also used by the client-side player) so
// this list can't drift out of sync with composables/useFullscreenEffect.js's VALID_TYPES.

export function isValidCMoonEffectType(value) {
  return value === null || CMOON_EFFECT_TYPES.includes(value)
}

// A cMoon captain always DISPLAYS as "Captain", regardless of whatever CMoonRank tier they've
// actually earned — a leadership title overriding the shown label only. Nothing about their
// underlying progression changes: cMoonPoints keeps accruing, currentCMoonRankId keeps getting
// granted/upgraded normally by the achievement engine, and the nightly Discord role sync
// (server/cron/sync-guild-members.js) still grants the earned rank's own role — this is a
// read-side label swap in the handful of places a member's rank name is surfaced to other
// players (cZone page, cMoon leaderboard, standings), not a change to the rank system itself.
export const CAPTAIN_DISPLAY_RANK_NAME = 'Captain'

export function displayRankName(rankName, isCaptain) {
  return isCaptain ? CAPTAIN_DISPLAY_RANK_NAME : (rankName || null)
}

// Batch-friendly: one query per cMoon rather than one per member row. Callers already iterating
// members of a single cMoon should call this once and check Set membership per row.
export async function getCMoonCaptainUserIdSet(cMoonId) {
  if (!cMoonId) return new Set()
  const rows = await prisma.cMoonCaptain.findMany({ where: { cMoonId }, select: { userId: true } })
  return new Set(rows.map(r => r.userId))
}

export async function isCMoonCaptain(cMoonId, userId) {
  if (!cMoonId || !userId) return false
  const row = await prisma.cMoonCaptain.findUnique({ where: { cMoonId_userId: { cMoonId, userId } } })
  return !!row
}

// GlobalGameConfig is read on the selection page/API on every load; cache briefly
// in-process to avoid hammering the singleton row (mirrors the pattern used by
// other hot config reads in this codebase, e.g. server/middleware/daily-points.js).
let cachedConfig = null
let cachedConfigAt = 0
const CONFIG_TTL_MS = 30_000

export async function getGlobalConfig({ fresh = false } = {}) {
  const now = Date.now()
  if (!fresh && cachedConfig && (now - cachedConfigAt) < CONFIG_TTL_MS) return cachedConfig
  const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  cachedConfig = cfg
  cachedConfigAt = now
  return cfg
}

export function invalidateGlobalConfigCache() {
  cachedConfig = null
  cachedConfigAt = 0
}

export const CMOON_SELECT_ERRORS = {
  DISABLED: 'CMOON_DISABLED',
  NOT_FOUND: 'CMOON_NOT_FOUND',
  ALREADY_ASSIGNED: 'CMOON_ALREADY_ASSIGNED',
  LOCKED: 'CMOON_LOCKED',
  BANNED: 'CMOON_USER_BANNED',
  REJOIN_COOLDOWN: 'CMOON_REJOIN_COOLDOWN',
  REJOIN_NOT_ALLOWED: 'CMOON_REJOIN_NOT_ALLOWED',
  // The user's cMoonId changed between when the caller decided to move them and when
  // reassignUserCMoon's guarded write ran (e.g. a concurrent Balance Teams run, or a second
  // admin action on the same user) — the caller should re-check current state and retry or
  // surface this rather than silently overwriting whatever the other writer just did.
  STALE_STATE: 'CMOON_STALE_STATE',
}

// The moment a player who opted out becomes eligible to rejoin, per the admin-configurable
// cooldown (GlobalGameConfig.cMoonOptOutCooldownDays — 0 disables it). Returns null when there's
// no cooldown to wait out: the player never opted out, or the configured cooldown is 0/invalid.
// Called from both server/api/cmoon/status.get.js (to show/hide the "Join a cMoon" CTA and its
// countdown) and selectCMoonForUser below (the actual enforcement).
export function computeCMoonRejoinAvailableAt(user, config) {
  if (!user?.cMoonOptedOut || !user?.cMoonOptedOutAt) return null
  const days = Number(config?.cMoonOptOutCooldownDays)
  if (!Number.isFinite(days) || days <= 0) return null
  return new Date(new Date(user.cMoonOptedOutAt).getTime() + days * 24 * 60 * 60 * 1000)
}

class CMoonError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// Grants a cMoon's configured prize cToons to a user. Called only after the
// selection/assignment transaction has committed (mint jobs are not
// transactional, so they must never run inside a $transaction that might roll back).
// Returns the granted prize list (name/image/quantity) purely for the caller to show a
// "here's what's coming" reveal — this is the same config already shown publicly on the
// cMoon's own page, not new information, and the mint jobs above are fire-and-forget, so
// this list describes what was queued, not a confirmed-delivered receipt.
async function grantCMoonPrizes(userId, cMoonId) {
  const prizes = await prisma.cMoonPrizeCtoon.findMany({
    where: { cMoonId },
    include: { ctoon: { select: { name: true, assetPath: true } } },
  })
  for (const prize of prizes) {
    const qty = Math.max(1, Number(prize.quantity || 1))
    for (let i = 0; i < qty; i++) {
      await mintQueue.add('mintCtoon', {
        userId,
        ctoonId: prize.ctoonId,
        isSpecial: true,
        method: 'CMOON_PRIZE',
      })
    }
  }
  return prizes.map(p => ({
    ctoonId: p.ctoonId,
    name: p.ctoon?.name || 'cToon',
    assetPath: p.ctoon?.assetPath || null,
    quantity: Math.max(1, Number(p.quantity || 1)),
  }))
}

// User-initiated selection. Atomic: the `updateMany({ where: { cMoonId: null } })`
// clause is the concurrency gate — Postgres serializes concurrent writers on the
// same row, and the second writer sees count===0 and is rejected. This prevents
// double-selection (and the double prize grant that would follow it) under
// concurrent double-submits.
export async function selectCMoonForUser(userId, cMoonId) {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) throw new CMoonError(CMOON_SELECT_ERRORS.DISABLED)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, cMoonId: true, cMoonOptedOut: true, cMoonOptedOutAt: true, discordId: true, inGuild: true },
  })
  if (!user) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)
  if (user.cMoonId) throw new CMoonError(CMOON_SELECT_ERRORS.ALREADY_ASSIGNED)

  // The two rejoin safeguards below only ever apply to a player who previously opted out — a
  // first-time chooser (cMoonOptedOut:false) is never subject to either one.
  if (user.cMoonOptedOut) {
    const rejoinAt = computeCMoonRejoinAvailableAt(user, config)
    if (rejoinAt && new Date() < rejoinAt) throw new CMoonError(CMOON_SELECT_ERRORS.REJOIN_COOLDOWN)
  }

  const cmoon = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, joinLocked: true, allowOptOutJoin: true, discordRoleId: true } })
  if (!cmoon) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)
  // Locked cMoons are only reachable via admin direct-assign (POST
  // /api/admin/users/[id]/update-cmoon), never through this self-serve path — enforced here,
  // not just by hiding the cMoon from GET /api/cmoons, so a known id can't bypass the UI.
  // This is a fast-path rejection for the common (non-racing) case, not the enforcement
  // boundary — see the joinLocked:false clause below, which is what actually closes the
  // TOCTOU window against an admin locking this cMoon between this read and the transaction
  // committing.
  if (cmoon.joinLocked) throw new CMoonError(CMOON_SELECT_ERRORS.LOCKED)
  // Team-balance safeguard: this cMoon has opted out of accepting returning/late joiners (see
  // CMoon.allowOptOutJoin) — only bites a player who previously opted out, same as the cooldown
  // check above.
  if (user.cMoonOptedOut && !cmoon.allowOptOutJoin) throw new CMoonError(CMOON_SELECT_ERRORS.REJOIN_NOT_ALLOWED)

  const assigned = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: userId, cMoonId: null },
      // Self-selection always starts a member at 0 cMoonPoints / no rank, regardless of
      // whatever they'd accumulated in a cMoon they previously left — cMoonPoints is only
      // ever written going forward by the aggregate cron (see cmoon-points-aggregate.js),
      // so a former member's stale total would otherwise linger until its next 15-minute
      // run. currentCMoonRankId/cMoonRankRoleGrantedAt are already guaranteed null here
      // (reassignUserCMoon nulls them whenever cMoonId is cleared), included for clarity.
      data: {
        cMoonId: cmoon.id, cMoonSelectedAt: new Date(), cMoonAutoAssigned: false,
        cMoonOptedOut: false, cMoonOptedOutAt: null,
        cMoonPoints: 0, currentCMoonRankId: null, cMoonRankRoleGrantedAt: null,
      },
    })
    if (result.count === 0) throw new CMoonError(CMOON_SELECT_ERRORS.ALREADY_ASSIGNED)
    // Re-checks joinLocked:false as part of the same atomic write, not just the pre-fetch
    // above — if an admin locked this cMoon in the gap between that read and here, count is 0
    // and the whole transaction (including the user update above) rolls back.
    const lockResult = await tx.cMoon.updateMany({
      where: { id: cmoon.id, joinLocked: false },
      data: { memberCount: { increment: 1 } },
    })
    if (lockResult.count === 0) throw new CMoonError(CMOON_SELECT_ERRORS.LOCKED)
    return cmoon.id
  })

  const prizes = await grantCMoonPrizes(userId, assigned)

  // Best-effort real-time Discord role grant, mirroring the admin-reassignment path
  // (reassignUserCMoon below) instead of leaving a self-selected join waiting on the
  // once-daily syncCMoonDiscordRoles cron. There's no old role to revoke here — the
  // ALREADY_ASSIGNED check above guarantees this user had no cMoon before this call — so
  // this only ever grants. Never lets a Discord-side failure (misconfigured role, rate
  // limiting, timeout) surface as a failed join: the cMoon assignment/prizes above have
  // already committed by this point, and cMoonRoleGrantedAt is deliberately left unset on
  // success (same as reassignUserCMoon) so the nightly cron still re-confirms the grant.
  let discordRoleSynced = null
  try {
    discordRoleSynced = await syncDiscordRolesForReassignment(user, null, cmoon.discordRoleId || null)
  } catch {
    discordRoleSynced = false
  }

  return { cMoonId: assigned, prizes, discordRoleSynced }
}

// User-initiated decline from the join modal — there is no more time-based auto-assignment, so
// declining just stops the modal from popping up automatically again (see canChoose in
// server/api/cmoon/status.get.js); the player can still join later via the "Join a cMoon" button
// on /newsite/cmoon-nav, which reopens the same modal. Atomic for the same reason
// selectCMoonForUser is: `updateMany({ where: { cMoonId: null } })` is the guard, not a pre-read
// check, so a concurrent opt-out can't race a concurrent join into a confusing half-state.
export async function optOutOfCMoonSelection(userId) {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) throw new CMoonError(CMOON_SELECT_ERRORS.DISABLED)

  const result = await prisma.user.updateMany({
    where: { id: userId, cMoonId: null },
    data: { cMoonOptedOut: true, cMoonOptedOutAt: new Date() },
  })
  if (result.count === 0) {
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, cMoonId: true } })
    if (!exists) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)
    throw new CMoonError(CMOON_SELECT_ERRORS.ALREADY_ASSIGNED)
  }
}

// Bounds a real-time Discord role sync so an admin action never hangs on Discord rate-limiting —
// grantGuildRole/revokeGuildRole can each sleep several seconds per 429 retry (see
// server/utils/discord.js), and this is called from an admin request handler, not a cron. The
// underlying call is left running past the timeout (its result is just no longer waited on) — a
// slow grant/revoke still lands, it's only the caller's confirmation that gives up early.
const DISCORD_SYNC_TIMEOUT_MS = 4000

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => { if (!settled) { settled = true; resolve(value) } }
    setTimeout(() => finish(null), ms)
    promise.then((ok) => finish(ok)).catch(() => finish(false))
  })
}

// Real-time (not nightly-cron) Discord role sync for a single user's cMoon change. Revoking a
// role is new capability, not an existing pattern being reused: every other Discord sync in this
// codebase (server/cron/sync-guild-members.js's addRoleToMember-backed jobs) is grant-only by
// deliberate design, so this is scoped tightly — called only from selectCMoonForUser above (grant
// only, no prior role to revoke) and reassignUserCMoon below (one user, one admin-initiated change
// at a time), never from a bulk or cron path. Returns true/false once both calls resolve within
// the timeout, or null if either is still in flight (not a failure — the nightly
// syncCMoonDiscordRoles job will still pick up a late grant via cMoonRoleGrantedAt).
async function syncDiscordRolesForReassignment(user, oldRoleId, newRoleId) {
  if (!user.discordId || !user.inGuild || (!oldRoleId && !newRoleId)) return null
  const [revoked, granted] = await Promise.all([
    oldRoleId ? withTimeout(revokeGuildRole(user.discordId, oldRoleId), DISCORD_SYNC_TIMEOUT_MS) : Promise.resolve(null),
    newRoleId ? withTimeout(grantGuildRole(user.discordId, newRoleId), DISCORD_SYNC_TIMEOUT_MS) : Promise.resolve(null),
  ])
  if (revoked === false || granted === false) return false
  if (revoked === null || granted === null) return null
  return true
}

// Single shared path for moving a user into, out of, or between cMoons — used by the admin
// "update user's cMoon" action, the new per-cMoon Members panel, captain auto-align (making
// someone a captain of a cMoon moves them into it), the "Balance Teams" bulk rebalance, and
// accepted player team-change requests. Deliberately ignores CMoon.joinLocked: admin placement
// into a locked cMoon is an existing, intentional override (see the joinLocked comment on the
// CMoon model), not something this function should re-litigate — callers that must respect
// joinLocked (e.g. the Balance Teams candidate/destination selection) enforce it themselves
// before calling in.
//
// Every reassignment — including Balance Teams and an accepted CMoonChangeRequest, which both
// route through this same function — resets User.cMoonPoints' aggregation window (via
// cMoonSelectedAt below) exactly like any other admin-driven move. This is deliberate, not an
// oversight: the universal rank ladder (CMoonRankTier) evaluates against cMoonPoints, and
// claimAchievementReward's cMoon-hop guard (server/utils/achievements.js) is written assuming a
// mover re-earns each cMoon's copy from zero — special-casing that reset away for some callers
// would undermine both. The part of "affinity" that's genuinely meant to survive a team move
// (CMoonAffinity.affinitySpent, UserCMoonBorder ownership) is a separate, permanent,
// per-(user, cMoon) track that a cMoonId change never touches — see CMoonAffinity's doc comment.
//
// Guards against a concurrent second mover (e.g. Balance Teams running while an admin accepts a
// change request for the same user) with a conditional `updateMany({ where: { cMoonId:
// target.cMoonId } } })` — if another writer already moved this user between the read above and
// this write, count is 0 and the whole reassignment aborts with CMOON_STALE_STATE instead of
// silently clobbering whatever the other writer just did.
//
// Callers that mutate memberCount indirectly through this function are responsible for calling
// invalidateCMoonList() (server/api/cmoons.get.js) afterward — not done here, since importing an
// API route file from this shared util would create a circular import (cmoons.get.js already
// imports getGlobalConfig from this file).
export async function reassignUserCMoon(userId, newCMoonId) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, cMoonId: true, banned: true, discordId: true, inGuild: true },
  })
  if (!target) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)

  let newCMoon = null
  if (newCMoonId) {
    newCMoon = await prisma.cMoon.findUnique({
      where: { id: newCMoonId },
      select: { id: true, name: true, color: true, discordRoleId: true },
    })
    if (!newCMoon) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)
  }

  // Checked before the ban guard below: a true no-op (already exactly where this call wants them)
  // must never fail just because the user happens to be banned — it isn't placing them anywhere.
  if (target.cMoonId === newCMoonId) {
    return { cMoonId: target.cMoonId, cMoonName: newCMoon?.name || null, cMoonColor: newCMoon?.color || null, discordRoleSynced: null }
  }

  // Removing someone from a cMoon (newCMoonId: null) is always allowed regardless of ban status
  // — that's cleanup. Placing a banned account INTO a (different) cMoon is never allowed.
  if (newCMoon && target.banned) throw new CMoonError(CMOON_SELECT_ERRORS.BANNED)

  const oldCMoon = target.cMoonId
    ? await prisma.cMoon.findUnique({ where: { id: target.cMoonId }, select: { id: true, discordRoleId: true } })
    : null

  await prisma.$transaction(async (tx) => {
    // Captains are placed into their cMoon by this same function (see cmoons.post.js /
    // cmoons/[id].put.js — the CMoonCaptain row is always created first), so this check
    // reflects captaincy of the DESTINATION cMoon at the moment of the move. Everyone else
    // moving in — an ordinary admin reassignment, Balance Teams, or an accepted change
    // request — starts that cMoon fresh at 0 cMoonPoints, same as a self-selected join (see
    // selectCMoonForUser), rather than carrying over whatever they'd earned in a cMoon they
    // previously belonged to.
    const isNewCaptain = newCMoon
      ? !!(await tx.cMoonCaptain.findUnique({ where: { cMoonId_userId: { cMoonId: newCMoon.id, userId } } }))
      : false
    const result = await tx.user.updateMany({
      where: { id: userId, cMoonId: target.cMoonId },
      data: {
        cMoonId: newCMoonId,
        cMoonSelectedAt: newCMoonId ? new Date() : null,
        cMoonAutoAssigned: false,
        // A rank/role-grant cursor only means something within the cMoon it was earned in — clear
        // both on any reassignment so a moved user doesn't keep a stale rank badge, and so the
        // nightly rank-role sync re-grants cleanly for whatever cMoon they're in now.
        currentCMoonRankId: null,
        cMoonRankRoleGrantedAt: null,
        cMoonRoleGrantedAt: null,
        // Mirrors selectCMoonForUser's reset on self-join: an admin-driven move (or removal) must
        // clear these the same way, or a user who once opted out keeps a stale cMoonOptedOut/
        // cMoonOptedOutAt around forever — harmless while they stay put, but if later removed
        // again, computeCMoonRejoinAvailableAt() would compute their rejoin cooldown off that old,
        // unrelated timestamp instead of the actual departure time.
        cMoonOptedOut: false,
        cMoonOptedOutAt: null,
        ...(newCMoon && !isNewCaptain ? { cMoonPoints: 0 } : {}),
      },
    })
    if (result.count === 0) throw new CMoonError(CMOON_SELECT_ERRORS.STALE_STATE)

    if (oldCMoon) {
      await tx.cMoon.update({ where: { id: oldCMoon.id }, data: { memberCount: { decrement: 1 } } })
      // A captain who no longer belongs to a cMoon shouldn't still show as its captain — this is
      // exactly the captain/member mismatch this feature exists to prevent, so clean it up here
      // rather than leaving an orphaned CMoonCaptain row behind on every reassignment.
      await tx.cMoonCaptain.deleteMany({ where: { cMoonId: oldCMoon.id, userId } })
    }
    if (newCMoon) {
      await tx.cMoon.update({ where: { id: newCMoon.id }, data: { memberCount: { increment: 1 } } })
    }
  })

  const discordRoleSynced = await syncDiscordRolesForReassignment(
    target,
    oldCMoon?.discordRoleId || null,
    newCMoon?.discordRoleId || null,
  )

  return {
    cMoonId: newCMoonId,
    cMoonName: newCMoon?.name || null,
    cMoonColor: newCMoon?.color || null,
    discordRoleSynced,
  }
}

// ── Admin "Balance Teams" bulk rebalance ────────────────────────────────────────
//
// Moves the minimum number of non-admin, non-banned players between unlocked cMoons so
// every team's eligible member count is as even as possible (every team lands on either
// floor(total/n) or that +1). Captains are never candidates: captaincy is only ever
// granted to isAdmin:true users (see CMoonCaptain), so excluding admins excludes every
// captain for free. joinLocked cMoons are excluded entirely, both as a source and a
// destination — reassignUserCMoon itself doesn't enforce joinLocked (see its own comment),
// so that exclusion has to live here in the candidate/destination selection.
//
// computeBalancePlan is a pure read — safe to call as often as needed for a preview. It is
// also re-run from scratch (never trusting a client-submitted plan) at the top of
// executeBalancePlan, so a stale preview or a double-submitted execute can never replay
// moves against outdated team membership — the second call just sees a more balanced (or
// already-balanced) state and computes a smaller-or-empty plan.
export async function computeBalancePlan() {
  const cmoons = await prisma.cMoon.findMany({
    where: { joinLocked: false },
    select: { id: true, name: true, color: true, discordRoleId: true },
    orderBy: { id: 'asc' },
  })

  const teamSummary = (current, target) => ({ current, target })
  if (cmoons.length < 2) {
    return { moves: [], teams: [], totalEligible: 0 }
  }

  const cmoonIds = cmoons.map((c) => c.id)
  const eligibleByTeam = await prisma.user.groupBy({
    by: ['cMoonId'],
    where: { cMoonId: { in: cmoonIds }, isAdmin: false, banned: false },
    _count: { _all: true },
  })
  const currentCountById = new Map(eligibleByTeam.map((r) => [r.cMoonId, r._count._all]))
  const totalEligible = [...currentCountById.values()].reduce((sum, n) => sum + n, 0)

  const n = cmoons.length
  const base = Math.floor(totalEligible / n)
  const remainder = totalEligible % n
  // Deterministic assignment of the "+1" remainder seats (order doesn't matter for fairness,
  // only for reproducibility of the same plan given the same input).
  const targetById = new Map()
  cmoons.forEach((c, i) => targetById.set(c.id, base + (i < remainder ? 1 : 0)))

  const teams = cmoons.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    ...teamSummary(currentCountById.get(c.id) || 0, targetById.get(c.id)),
  }))

  const overTeams = teams.filter((t) => t.current > t.target)
  const underTeams = teams.filter((t) => t.current < t.target)
  if (!overTeams.length || !underTeams.length) {
    return { moves: [], teams, totalEligible }
  }

  const overIds = overTeams.map((t) => t.id)
  const candidates = await prisma.user.findMany({
    where: { cMoonId: { in: overIds }, isAdmin: false, banned: false },
    select: { id: true, username: true, cMoonId: true },
    orderBy: { id: 'asc' },
  })
  const candidatesByTeam = new Map()
  for (const u of candidates) {
    if (!candidatesByTeam.has(u.cMoonId)) candidatesByTeam.set(u.cMoonId, [])
    candidatesByTeam.get(u.cMoonId).push(u)
  }
  const cmoonById = new Map(cmoons.map((c) => [c.id, c]))

  // Flatten "who's movable" into one queue: exactly `current - target` users from each
  // over-populated team, in the order sums(over deltas) === sum(under deltas) guarantees
  // the queue below fully satisfies every under-team's need with nothing left over.
  const moveQueue = []
  for (const t of overTeams) {
    const pool = candidatesByTeam.get(t.id) || []
    const take = pool.slice(0, t.current - t.target)
    for (const u of take) moveQueue.push({ user: u, from: cmoonById.get(t.id) })
  }

  const moves = []
  let qi = 0
  for (const t of underTeams) {
    let need = t.target - t.current
    const to = cmoonById.get(t.id)
    while (need > 0 && qi < moveQueue.length) {
      const { user, from } = moveQueue[qi++]
      moves.push({
        userId: user.id,
        username: user.username,
        fromCMoonId: from.id,
        fromName: from.name,
        fromColor: from.color,
        fromDiscordRoleId: from.discordRoleId,
        toCMoonId: to.id,
        toName: to.name,
        toColor: to.color,
        toDiscordRoleId: to.discordRoleId,
      })
      need--
    }
  }

  return { moves, teams, totalEligible }
}

// Applies the plan computeBalancePlan() would compute right now (always recomputed fresh
// here, never trusting a caller-supplied plan). DB writes are batched per (fromCMoon,
// toCMoon) pair — a handful of guarded updateMany calls plus one memberCount update per
// touched team — rather than looping a per-user reassignUserCMoon call, which would mean
// one transaction and multiple row locks on the same two CMoon rows per moved player.
// Every moved player's cMoonSelectedAt is reset to now and cMoonPoints explicitly zeroed,
// exactly like reassignUserCMoon does for any other move (see that function's own comment for
// why this reset is load-bearing, not incidental). No join-prize cToons are
// granted (mirrors reassignUserCMoon, which never grants prizes itself either), and rank/
// role-grant cursors are cleared exactly like a normal reassignment so the nightly cron
// re-evaluates them cleanly for the new team.
//
// Discord role sync is NOT awaited inline — syncDiscordRolesForReassignment is explicitly
// scoped to one-user admin requests (see its own comment) and looping it here for
// potentially hundreds of users would make this request take minutes and risk hammering
// Discord's rate limits. Instead the DB commit finishes fast, the response returns
// immediately, and role sync for the moved batch runs afterward with bounded concurrency
// in the background (see syncBalanceMoveDiscordRolesInBackground) — exactly the same
// eventual-consistency guarantee (backstopped by the nightly syncCMoonDiscordRoles cron)
// that self-select and auto-assign already rely on today.
export async function executeBalancePlan() {
  const plan = await computeBalancePlan()
  if (!plan.moves.length) return { moved: 0, teams: plan.teams, moves: [] }

  const groups = new Map()
  for (const mv of plan.moves) {
    const key = `${mv.fromCMoonId}|${mv.toCMoonId}`
    if (!groups.has(key)) groups.set(key, { fromCMoonId: mv.fromCMoonId, toCMoonId: mv.toCMoonId, userIds: [] })
    groups.get(key).userIds.push(mv.userId)
  }

  const teamDelta = new Map()
  await prisma.$transaction(async (tx) => {
    for (const group of groups.values()) {
      // Conditional on cMoonId still matching the plan's assumption — if a concurrent
      // change (e.g. an admin accepting a CMoonChangeRequest for one of these users in the
      // gap between the read above and this write) already moved someone, they're simply
      // excluded from this run rather than clobbered; the next Balance Teams click will
      // account for wherever they actually ended up.
      const result = await tx.user.updateMany({
        where: { id: { in: group.userIds }, cMoonId: group.fromCMoonId, isAdmin: false, banned: false },
        data: {
          cMoonId: group.toCMoonId,
          cMoonSelectedAt: new Date(),
          cMoonAutoAssigned: false,
          currentCMoonRankId: null,
          cMoonRankRoleGrantedAt: null,
          cMoonRoleGrantedAt: null,
          // isAdmin:false in the where clause above already excludes every captain (see this
          // function's header comment), so unlike reassignUserCMoon this never needs a
          // per-user captaincy check — every mover here starts the destination team fresh at
          // 0 cMoonPoints, same as any other reassignment (see reassignUserCMoon's comment).
          cMoonPoints: 0,
        },
      })
      if (result.count > 0) {
        teamDelta.set(group.fromCMoonId, (teamDelta.get(group.fromCMoonId) || 0) - result.count)
        teamDelta.set(group.toCMoonId, (teamDelta.get(group.toCMoonId) || 0) + result.count)
      }
    }

    for (const [cMoonId, delta] of teamDelta) {
      if (delta !== 0) {
        await tx.cMoon.update({ where: { id: cMoonId }, data: { memberCount: { increment: delta } } })
      }
    }
  })

  const totalMoved = [...teamDelta.values()].filter((d) => d > 0).reduce((sum, d) => sum + d, 0)
  if (totalMoved === 0) return { moved: 0, teams: plan.teams, moves: [] }

  // Re-read exactly who actually landed on their planned destination (excludes anyone
  // skipped above due to the race guard) to drive both the Discord sync batch and the
  // response's move list.
  const destinationIds = [...new Set(plan.moves.map((m) => m.toCMoonId))]
  const settled = await prisma.user.findMany({
    where: { id: { in: plan.moves.map((m) => m.userId) }, cMoonId: { in: destinationIds } },
    select: { id: true, discordId: true, inGuild: true, cMoonId: true },
  })
  const settledByUserId = new Map(settled.map((u) => [u.id, u]))
  const appliedMoves = plan.moves.filter((m) => settledByUserId.get(m.userId)?.cMoonId === m.toCMoonId)

  syncBalanceMoveDiscordRolesInBackground(appliedMoves, settledByUserId)

  return { moved: appliedMoves.length, teams: plan.teams, moves: appliedMoves }
}

// Runs Discord role sync for a batch of already-committed cMoon moves with bounded
// concurrency, without the caller (executeBalancePlan / the admin HTTP request) waiting on
// it — the DB write is the source of truth and has already committed by the time this
// runs. Never throws: any failure here just means the nightly syncCMoonDiscordRoles cron
// (which grants any role where cMoonRoleGrantedAt IS NULL — already true for every user
// touched by executeBalancePlan) picks up the grant later, same as it does today for
// self-select and auto-assign.
const BALANCE_DISCORD_SYNC_CONCURRENCY = 4

async function syncBalanceMoveDiscordRolesInBackground(moves, settledByUserId) {
  let cursor = 0
  async function worker() {
    while (cursor < moves.length) {
      const mv = moves[cursor++]
      const user = settledByUserId.get(mv.userId)
      if (!user) continue
      try {
        await syncDiscordRolesForReassignment(user, mv.fromDiscordRoleId || null, mv.toDiscordRoleId || null)
      } catch (err) {
        console.warn('[cmoon] balance-teams Discord sync failed for user', mv.userId, err?.message || err)
      }
    }
  }
  const workers = Array.from({ length: Math.min(BALANCE_DISCORD_SYNC_CONCURRENCY, moves.length) }, worker)
  Promise.all(workers).catch(() => {})
}

// ── Poll vote tallies ───────────────────────────────────────────────────────────
//
// Results are only ever shown to a user once they've voted (product decision), which in
// practice means most returning visitors to a cMoon page with an active poll — so this is a
// real hot path, not a rare one. Cached per pollId with a short in-process TTL (same pattern as
// server/api/cmoons.get.js's 30s list cache), invalidated on every vote and on any admin
// replace/delete of the poll — never left to just expire, since a poll's own voters are exactly
// the audience who'd notice stale counts.
const pollResultsCache = new Map() // pollId -> { at, results: [{ optionId, count }] }
const POLL_RESULTS_TTL_MS = 30_000

export async function getPollResults(pollId) {
  const cached = pollResultsCache.get(pollId)
  if (cached && (Date.now() - cached.at) < POLL_RESULTS_TTL_MS) return cached.results
  const rows = await prisma.cMoonPollVote.groupBy({ by: ['optionId'], where: { pollId }, _count: { optionId: true } })
  const results = rows.map(r => ({ optionId: r.optionId, count: r._count.optionId }))
  pollResultsCache.set(pollId, { at: Date.now(), results })
  return results
}

export function invalidatePollResults(pollId) {
  pollResultsCache.delete(pollId)
}

export { CMoonError }
