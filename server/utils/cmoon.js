// server/utils/cmoon.js
// Shared logic for the cMoon (faction) feature: eligibility/deadline math, atomic
// self-selection, cron auto-assignment, prize granting, and the weekly team
// leaderboard scoring. Kept in one place so the feature is easy to rip out later —
// see GlobalGameConfig.cMoonEnabled.
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { mintQueue } from './queues.js'
import { getWeekWindowStart } from './centralTime.js'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from './dailyTaskWindows.js'
import { COMBAT_POOL_GAME_NAMES } from './gamePoints.js'
import { EXCLUDED_SYSTEM_USER_ID } from './economyValuation.js'
import { grantGuildRole, revokeGuildRole } from './discord.js'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

// ── Weekly cMoon team leaderboard scoring ──────────────────────────────────────
//
// Three bonuses, awarded once per calendar week (Monday 00:00 America/Chicago —
// see getWeekWindowStart) to whichever cMoon a qualifying player belongs to:
//   - HIGH_SCORE (default 100 pts/player): holding rank #1 (all-time) on an eligible arcade game.
//   - TOP10 (default 50 pts/player): a top-N finish on an eligible board (Top Points / Total cToons).
//   - DAILY_TASK (default 10 pts/player/day): each day that week the player completed at
//     least one of the existing daily tasks (recorded by recordDailyTaskCompletions,
//     run daily — see server/cron/record-daily-task-completions.js).
//
// All the numbers above, the minimum-account-age anti-abuse gate, which games are
// HIGH_SCORE-eligible, and which boards/rank-cutoff count for TOP10 are admin-editable
// (Admin > cMoons > Scoring Rules — see resolveScoringConfig below and
// server/api/admin/cmoon-scoring.post.js). Changes apply forward-only: they affect
// only future weekly cron runs, never rewrite past CMoonScoreLog rows/teamScore.
//
// A minimum account age (defaulting to the 3-day cMoon self-selection window) gates
// all three: a brand-new throwaway account can join a cMoon and immediately inflate
// its score by camping a low-traffic game's #1 spot or grinding the (cheap) daily
// tasks. Requiring the account to first survive N days raises the cost of that
// without adding new anti-abuse infrastructure beyond what already exists for
// selection. NOTE: this is a distinct concept from THREE_DAYS_MS below, which gates
// the *selection* deadline (computeCMoonDeadline/autoAssignExpiredCMoonUsers) — the
// two happen to share the same default but are configured/read independently.
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

// Current all-time #1 for a score-based game (highest, or lowest for ReOrbit Memory's
// move count). Shape/exclusions mirror server/utils/gameLeaderboard.js's buildTop11.
// `table`/`column` are compile-time constants from SCORE_GAMES above, never runtime input —
// same convention gameLeaderboard.js documents for the identical reason: they can't be bind
// parameters, so $queryRawUnsafe is used with every actual value still bound.
async function findTopScoreHolder({ table, column, direction, extraWhere }) {
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
    LIMIT 1
  `
  const rows = await prisma.$queryRawUnsafe(sql, EXCLUDED_SYSTEM_USER_ID)
  return rows[0] || null
}

// Current all-time #1 by win count for a duel-match game. Shape mirrors
// server/utils/duelLeaderboard.js's rankedRows (all-time period, natural endings only).
// `table` is a compile-time constant from WIN_GAMES above — see the note on findTopScoreHolder.
async function findTopWinsHolder({ table }) {
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
    LIMIT 1
  `
  const rows = await prisma.$queryRawUnsafe(sql, EXCLUDED_SYSTEM_USER_ID)
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
// can never silently disagree about whether "today" was completed. Runs every 4 hours (see
// server/cron/record-daily-task-completions.js) rather than once daily: the underlying tasks
// reset at two different times (8pm Chicago for most, 8am for Winwheel/Lotto/monster scans),
// so a single daily run would leave a window where 8am-boundary activity could go unrecorded.
// Idempotent either way — UserDailyTaskCompletion is unique on (userId, date).
export async function recordDailyTaskCompletions() {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) return { recorded: 0 }

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

  const dailyBoundary = getChicagoDailyBoundary()
  const morningBoundary = getChicagoMorningWindowStart()
  const { minAccountAgeDays } = resolveScoringConfig(config)
  const minAccountAgeCutoff = new Date(Date.now() - minAccountAgeDays * 24 * 60 * 60 * 1000)
  const combatNames = Prisma.join(COMBAT_POOL_GAME_NAMES)

  // daily.get.js only ever treats a threshold-based task as completable when its configured
  // limit is > 0 (an admin-set 0 means "no cap configured", not "impossible to complete") —
  // every branch below mirrors that exactly, falling back to an inert always-empty branch.
  const inert = Prisma.sql`SELECT NULL::text AS "userId" WHERE FALSE`
  const czoneBranch = czoneVisitMaxPerDay > 0
    ? Prisma.sql`
        SELECT "userId" FROM "PointsLog"
        WHERE "method" = 'cZone Visit' AND "createdAt" >= ${dailyBoundary}
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING COUNT(*) >= ${czoneVisitMaxPerDay}`
    : inert
  const gameptsBranch = dailyPointLimit > 0
    ? Prisma.sql`
        SELECT "userId" FROM "GamePointLog"
        WHERE "createdAt" >= ${dailyBoundary}
          AND ("gameName" IS NULL OR "gameName" NOT IN (${combatNames}))
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING SUM("points") >= ${dailyPointLimit}`
    : inert
  const tkoptsBranch = tkoDailyPointLimit > 0
    ? Prisma.sql`
        SELECT "userId" FROM "GamePointLog"
        WHERE "createdAt" >= ${dailyBoundary}
          AND "gameName" IN (${combatNames})
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING SUM("points") >= ${tkoDailyPointLimit}`
    : inert
  const wheelBranch = winwheelMaxDailySpins > 0
    ? Prisma.sql`
        SELECT "userId" FROM "WheelSpinLog"
        WHERE "createdAt" >= ${morningBoundary} AND "status" <> 'failed'
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING COUNT(*) >= ${winwheelMaxDailySpins}`
    : inert
  const lottoBranch = lottoCountPerDay > 0
    ? Prisma.sql`
        SELECT "userId" FROM "LottoUser"
        WHERE "lastReset" >= ${morningBoundary} AND "purchasesToday" >= ${lottoCountPerDay}
          AND "userId" IN (SELECT id FROM eligible)`
    : inert
  const scansBranch = monsterDailyScanLimit > 0
    ? Prisma.sql`
        SELECT "userId" FROM "UserBarcodeScan"
        WHERE "lastScannedAt" >= ${morningBoundary}
          AND "userId" IN (SELECT id FROM eligible)
        GROUP BY "userId" HAVING COUNT(*) >= ${monsterDailyScanLimit}`
    : inert

  const rows = await prisma.$queryRaw`
    WITH eligible AS (
      SELECT id FROM "User"
      WHERE "cMoonId" IS NOT NULL AND "createdAt" <= ${minAccountAgeCutoff}
        AND "active" = true AND COALESCE("banned", false) = false
    ),
    login AS (
      SELECT DISTINCT "userId" FROM "PointsLog"
      WHERE "method" = 'Daily Login' AND "createdAt" >= ${dailyBoundary}
        AND "userId" IN (SELECT id FROM eligible)
    ),
    czone AS (${czoneBranch}),
    gamepts AS (${gameptsBranch}),
    tkopts AS (${tkoptsBranch}),
    wheel AS (${wheelBranch}),
    lotto AS (${lottoBranch}),
    scans AS (${scansBranch}),
    qualifying AS (
      SELECT "userId" FROM login
      UNION SELECT "userId" FROM czone
      UNION SELECT "userId" FROM gamepts
      UNION SELECT "userId" FROM tkopts
      UNION SELECT "userId" FROM wheel
      UNION SELECT "userId" FROM lotto
      UNION SELECT "userId" FROM scans
    )
    INSERT INTO "UserDailyTaskCompletion" (id, "userId", "date")
    SELECT gen_random_uuid()::text, "userId", ${dailyBoundary} FROM qualifying
    ON CONFLICT ("userId", "date") DO NOTHING
    RETURNING id
  `
  return { recorded: rows.length }
}

// Fully recomputes CMoon.teamScore from CMoonScoreLog (never incremented directly — see
// the module-level comment above). Two-statement reset-then-recompute, both in one
// transaction, mirrors server/cron/czone-display-count.js's runCzoneDisplayCountAggregate.
async function recomputeCMoonTeamScores() {
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

// Weekly cron entry point (server/cron/cmoon-weekly-score.js). Gathers every qualifying
// award for the week that just ended, bulk-inserts them (idempotent via the unique
// constraint), then recomputes every cMoon's teamScore from the log. Safe to re-run.
export async function runWeeklyCMoonScoring() {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) return { awarded: 0 }

  const {
    highScorePoints, top10Points, dailyTaskPoints, minAccountAgeDays, top10RankCutoff,
    top10PointsBoardEnabled, top10CtoonsBoardEnabled, activeScoreGames, activeWinGames,
  } = resolveScoringConfig(config)

  const weekStart = getWeekWindowStart()
  const weekBegin = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const minAccountAgeCutoff = new Date(Date.now() - minAccountAgeDays * 24 * 60 * 60 * 1000)

  const candidates = []

  const [scoreHolders, winHolders, top10PointsHolders, top10CtoonsHolders] = await Promise.all([
    Promise.all(activeScoreGames.map(g => findTopScoreHolder(g))),
    Promise.all(activeWinGames.map(g => findTopWinsHolder(g))),
    top10PointsBoardEnabled ? getTop10PointsHolders(top10RankCutoff) : Promise.resolve([]),
    top10CtoonsBoardEnabled ? getTop10TotalCtoonsHolders(top10RankCutoff) : Promise.resolve([]),
  ])

  activeScoreGames.forEach((g, i) => {
    const holder = scoreHolders[i]
    if (isEligibleHolder(holder, minAccountAgeCutoff)) {
      candidates.push({ cMoonId: holder.cMoonId, userId: holder.userId, category: 'HIGH_SCORE', detail: g.name, points: highScorePoints, weekStart })
    }
  })
  activeWinGames.forEach((g, i) => {
    const holder = winHolders[i]
    if (isEligibleHolder(holder, minAccountAgeCutoff)) {
      candidates.push({ cMoonId: holder.cMoonId, userId: holder.userId, category: 'HIGH_SCORE', detail: g.name, points: highScorePoints, weekStart })
    }
  })
  for (const row of eligibleHolders(top10PointsHolders, minAccountAgeCutoff)) {
    candidates.push({ cMoonId: row.cMoonId, userId: row.userId, category: 'TOP10', detail: 'points', points: top10Points, weekStart })
  }
  for (const row of eligibleHolders(top10CtoonsHolders, minAccountAgeCutoff)) {
    candidates.push({ cMoonId: row.cMoonId, userId: row.userId, category: 'TOP10', detail: 'totalCtoons', points: top10Points, weekStart })
  }

  const dailyTaskRows = await prisma.userDailyTaskCompletion.findMany({
    where: { date: { gte: weekBegin, lt: weekStart }, user: { cMoonId: { not: null } } },
    select: { userId: true, date: true, user: { select: { cMoonId: true } } }
  })
  for (const row of dailyTaskRows) {
    candidates.push({
      cMoonId: row.user.cMoonId, userId: row.userId, category: 'DAILY_TASK',
      detail: row.date.toISOString(), points: dailyTaskPoints, weekStart
    })
  }

  if (candidates.length) {
    await prisma.cMoonScoreLog.createMany({ data: candidates, skipDuplicates: true })
  }
  await recomputeCMoonTeamScores()

  return { awarded: candidates.length }
}

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
export const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/

export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value)
}

export function isValidDiscordSnowflake(value) {
  return typeof value === 'string' && DISCORD_SNOWFLAKE_RE.test(value)
}

// Explicit allow-list checked before any value reaches Prisma, matching the isValidHexColor /
// isValidDiscordSnowflake convention above — an invalid enum value should fail with a clean 400
// here, not surface as an unhandled Prisma validation error from the write itself.
export const CMOON_EFFECT_TYPES = ['GLITCH', 'SLIME']

export function isValidCMoonEffectType(value) {
  return value === null || CMOON_EFFECT_TYPES.includes(value)
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

// A user's personal deadline to pick a cMoon before they're auto-assigned:
//  - joined on/after the feature's launch (cMoonEnabledAt): 3 days from their own join date
//  - joined before launch (an "existing" user): the shared cMoonSelectionDeadlineAt
// Returns null if the feature isn't enabled or the user already has a cMoon.
export function computeCMoonDeadline(user, config) {
  if (!config?.cMoonEnabled || !config.cMoonEnabledAt) return null
  if (user.cMoonId) return null
  const createdAt = new Date(user.createdAt)
  const enabledAt = new Date(config.cMoonEnabledAt)
  if (createdAt >= enabledAt) {
    return new Date(createdAt.getTime() + THREE_DAYS_MS)
  }
  return config.cMoonSelectionDeadlineAt ? new Date(config.cMoonSelectionDeadlineAt) : null
}

export const CMOON_SELECT_ERRORS = {
  DISABLED: 'CMOON_DISABLED',
  NOT_FOUND: 'CMOON_NOT_FOUND',
  ALREADY_ASSIGNED: 'CMOON_ALREADY_ASSIGNED',
  DEADLINE_PASSED: 'CMOON_DEADLINE_PASSED',
  LOCKED: 'CMOON_LOCKED',
  BANNED: 'CMOON_USER_BANNED',
  // The user's cMoonId changed between when the caller decided to move them and when
  // reassignUserCMoon's guarded write ran (e.g. a concurrent Balance Teams run, or a second
  // admin action on the same user) — the caller should re-check current state and retry or
  // surface this rather than silently overwriting whatever the other writer just did.
  STALE_STATE: 'CMOON_STALE_STATE',
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
async function grantCMoonPrizes(userId, cMoonId) {
  const prizes = await prisma.cMoonPrizeCtoon.findMany({ where: { cMoonId } })
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
    select: { id: true, createdAt: true, cMoonId: true },
  })
  if (!user) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)
  if (user.cMoonId) throw new CMoonError(CMOON_SELECT_ERRORS.ALREADY_ASSIGNED)

  const deadline = computeCMoonDeadline(user, config)
  if (deadline && new Date() > deadline) throw new CMoonError(CMOON_SELECT_ERRORS.DEADLINE_PASSED)

  const cmoon = await prisma.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, joinLocked: true } })
  if (!cmoon) throw new CMoonError(CMOON_SELECT_ERRORS.NOT_FOUND)
  // Locked cMoons are only reachable via admin direct-assign (POST
  // /api/admin/users/[id]/update-cmoon), never through this self-serve path — enforced here,
  // not just by hiding the cMoon from GET /api/cmoons, so a known id can't bypass the UI.
  // This is a fast-path rejection for the common (non-racing) case, not the enforcement
  // boundary — see the joinLocked:false clause below, which is what actually closes the
  // TOCTOU window against an admin locking this cMoon between this read and the transaction
  // committing.
  if (cmoon.joinLocked) throw new CMoonError(CMOON_SELECT_ERRORS.LOCKED)

  const assigned = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: userId, cMoonId: null },
      data: { cMoonId: cmoon.id, cMoonSelectedAt: new Date(), cMoonAutoAssigned: false },
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

  await grantCMoonPrizes(userId, assigned)
  return assigned
}

// Assigns one user to whatever unlocked cMoon currently has the fewest members (the
// balancing step of auto-assignment — each call re-reads memberCount, so a stream of
// stragglers naturally spreads evenly across every unlocked cMoon rather than piling
// into one). Locked cMoons are excluded entirely: never a candidate for auto-assignment,
// only reachable via the admin "update cMoon" endpoint. `FOR UPDATE` on the chosen CMoon
// row serializes concurrent assignments so two callers can't both read the same
// "smallest" moon before either commits.
async function assignSmallestCMoonToUser(userId) {
  return prisma.$transaction(async (tx) => {
    const [smallest] = await tx.$queryRaw`
      SELECT id FROM "CMoon" WHERE "joinLocked" = false ORDER BY "memberCount" ASC, id ASC LIMIT 1 FOR UPDATE
    `
    if (!smallest) return null

    const result = await tx.user.updateMany({
      where: { id: userId, cMoonId: null },
      data: { cMoonId: smallest.id, cMoonSelectedAt: new Date(), cMoonAutoAssigned: true },
    })
    if (result.count === 0) return null

    await tx.cMoon.update({ where: { id: smallest.id }, data: { memberCount: { increment: 1 } } })
    return smallest.id
  })
}

// Daily cron entry point. Finds users whose personal deadline has passed and
// haven't picked a cMoon, auto-assigns them to the smallest cMoon, and grants
// that cMoon's prizes. Capped per run so a large backlog can't stall the shared
// cron process or flood the mint queue in one shot; it drains across days.
export async function autoAssignExpiredCMoonUsers({ batchLimit = 200, maxBatches = 5 } = {}) {
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled || !config.cMoonEnabledAt) return { processed: 0 }

  const unlockedCmoonCount = await prisma.cMoon.count({ where: { joinLocked: false } })
  if (unlockedCmoonCount === 0) {
    // Nothing to assign into. Not an error — an admin may have locked every cMoon on
    // purpose — but worth a log line since it otherwise fails silently and expired users
    // just stay unassigned indefinitely until an admin unlocks one or assigns them by hand.
    console.warn('[cmoon] autoAssignExpiredCMoonUsers: no unlocked cMoons available, skipping')
    return { processed: 0 }
  }

  const now = new Date()
  const newUserCutoff = new Date(now.getTime() - THREE_DAYS_MS)
  const enabledAt = new Date(config.cMoonEnabledAt)
  const globalDeadlinePassed = !!(config.cMoonSelectionDeadlineAt && now > new Date(config.cMoonSelectionDeadlineAt))

  const orClauses = [
    { createdAt: { gte: enabledAt, lt: newUserCutoff } },
  ]
  if (globalDeadlinePassed) {
    orClauses.push({ createdAt: { lt: enabledAt } })
  }

  let processed = 0
  for (let batch = 0; batch < maxBatches; batch++) {
    const candidates = await prisma.user.findMany({
      where: {
        cMoonId: null,
        active: true,
        banned: false,
        // Admins (which includes every cMoon captain — captaincy is only ever granted to
        // isAdmin:true users, see CMoonCaptain) are never swept into balancing. An admin who
        // hasn't personally picked a cMoon should stay unassigned indefinitely rather than being
        // dropped into a faction they may end up captaining (or moved into) later — see
        // reassignUserCMoon below, which is the only path that should ever set an admin's cMoonId.
        isAdmin: false,
        OR: orClauses,
      },
      select: { id: true },
      take: batchLimit,
    })
    if (candidates.length === 0) break

    for (const { id: userId } of candidates) {
      try {
        const cMoonId = await assignSmallestCMoonToUser(userId)
        if (cMoonId) {
          await grantCMoonPrizes(userId, cMoonId)
          processed++
        }
      } catch {
        // one user's failure shouldn't stop the rest of the batch
      }
    }

    if (candidates.length < batchLimit) break
  }

  return { processed }
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

// Real-time (not nightly-cron) Discord role sync for a single reassignment. Revoking a role is
// new capability, not an existing pattern being reused: every other Discord sync in this codebase
// (server/cron/sync-guild-members.js's addRoleToMember-backed jobs) is grant-only by deliberate
// design, so this is scoped tightly — called only from reassignUserCMoon below (one user, one
// admin-initiated change at a time), never from a bulk or cron path. Returns true/false once both
// calls resolve within the timeout, or null if either is still in flight (not a failure — the
// nightly syncCMoonDiscordRoles job will still pick up a late grant via cMoonRoleGrantedAt).
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
// `options.skipPointsReset` (default false): when true, leaves cMoonSelectedAt untouched
// instead of resetting it to now/null. Normally a reassignment restarts the cMoonPoints
// aggregation window (see the User.cMoonPoints doc comment) — that's the right behavior for an
// admin placing someone somewhere new. But Balance Teams and an approved CMoonChangeRequest are
// meant to carry a player's existing affinity/points forward rather than wipe them out, so those
// two callers pass skipPointsReset: true. Every other existing call site omits it and keeps
// today's reset-on-move behavior unchanged.
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
export async function reassignUserCMoon(userId, newCMoonId, options = {}) {
  const { skipPointsReset = false } = options
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
    const result = await tx.user.updateMany({
      where: { id: userId, cMoonId: target.cMoonId },
      data: {
        cMoonId: newCMoonId,
        ...(skipPointsReset ? {} : { cMoonSelectedAt: newCMoonId ? new Date() : null }),
        cMoonAutoAssigned: false,
        // A rank/role-grant cursor only means something within the cMoon it was earned in — clear
        // both on any reassignment so a moved user doesn't keep a stale rank badge, and so the
        // nightly rank-role sync re-grants cleanly for whatever cMoon they're in now.
        currentCMoonRankId: null,
        cMoonRankRoleGrantedAt: null,
        cMoonRoleGrantedAt: null,
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
// Every moved player's cMoonSelectedAt is left untouched (skipPointsReset semantics), no
// join-prize cToons are granted (mirrors reassignUserCMoon, which never grants prizes
// itself either), and rank/role-grant cursors are cleared exactly like a normal
// reassignment so the nightly cron re-evaluates them cleanly for the new team.
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
          cMoonAutoAssigned: false,
          currentCMoonRankId: null,
          cMoonRankRoleGrantedAt: null,
          cMoonRoleGrantedAt: null,
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

export { CMoonError }
