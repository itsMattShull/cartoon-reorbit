// server/api/admin/cmoon-scoring.post.js
// Admin-editable knobs for the weekly cMoon team-leaderboard scoring job (see
// server/utils/cmoon.js runWeeklyCMoonScoring/recordDailyTaskCompletions). Stored on
// the shared GlobalGameConfig singleton, same convention as every other feature-scoped
// config (scavenger, release settings, rarity defaults, etc — see
// server/api/admin/scavenger/config.post.js). Changes are forward-only: they affect
// only future cron runs, never rewrite past CMoonScoreLog rows or CMoon.teamScore.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { invalidateGlobalConfigCache, SCORE_GAME_OPTIONS, WIN_GAME_OPTIONS } from '@/server/utils/cmoon'

const POINTS_MIN = 0
const POINTS_MAX = 100000
const MIN_ACCOUNT_AGE_DAYS_MAX = 365
const RANK_CUTOFF_MIN = 1
const RANK_CUTOFF_MAX = 250

const SCORE_GAME_KEYS = new Set(SCORE_GAME_OPTIONS.map(g => g.key))
const WIN_GAME_KEYS = new Set(WIN_GAME_OPTIONS.map(g => g.key))

function requireInt(value, { min, max, label }) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw createError({ statusCode: 400, statusMessage: `${label} must be a whole number between ${min} and ${max}` })
  }
  return n
}

// Validates that every entry is one of the known compile-time game keys, and rejects
// (rather than silently drops) anything else — a stored-but-unvalidated key could later
// be trusted by other code as pre-validated.
function requireGameKeyList(value, knownKeys, label) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: `${label} must be a list of game keys` })
  }
  const keys = value.map(v => String(v))
  for (const k of keys) {
    if (!knownKeys.has(k)) {
      throw createError({ statusCode: 400, statusMessage: `${label} contains an unknown game key: ${k}` })
    }
  }
  return [...new Set(keys)]
}

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)

  // Every field is pulled and coerced individually — the upsert `data` object below is
  // built key-by-key from these locals, never from a spread of `body`, so extra
  // client-sent fields can never reach the write.
  const highScorePoints = requireInt(body?.highScorePoints, { min: POINTS_MIN, max: POINTS_MAX, label: 'High score points' })
  const top10Points = requireInt(body?.top10Points, { min: POINTS_MIN, max: POINTS_MAX, label: 'Top 10 points' })
  const dailyTaskPoints = requireInt(body?.dailyTaskPoints, { min: POINTS_MIN, max: POINTS_MAX, label: 'Daily task points' })
  const minAccountAgeDays = requireInt(body?.minAccountAgeDays, { min: 0, max: MIN_ACCOUNT_AGE_DAYS_MAX, label: 'Minimum account age (days)' })
  const top10RankCutoff = requireInt(body?.top10RankCutoff, { min: RANK_CUTOFF_MIN, max: RANK_CUTOFF_MAX, label: 'Top 10 rank cutoff' })
  const top10PointsBoardEnabled = !!body?.top10PointsBoardEnabled
  const top10CtoonsBoardEnabled = !!body?.top10CtoonsBoardEnabled
  const disabledScoreGames = requireGameKeyList(body?.disabledScoreGames, SCORE_GAME_KEYS, 'Disabled score games')
  const disabledWinGames = requireGameKeyList(body?.disabledWinGames, WIN_GAME_KEYS, 'Disabled win games')

  const data = {
    cMoonHighScorePoints: highScorePoints,
    cMoonTop10Points: top10Points,
    cMoonDailyTaskPoints: dailyTaskPoints,
    cMoonScoringMinAccountAgeDays: minAccountAgeDays,
    cMoonTop10RankCutoff: top10RankCutoff,
    cMoonTop10PointsBoardEnabled: top10PointsBoardEnabled,
    cMoonTop10CtoonsBoardEnabled: top10CtoonsBoardEnabled,
    cMoonDisabledScoreGames: disabledScoreGames,
    cMoonDisabledWinGames: disabledWinGames,
  }

  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const updated = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, ...data },
    update: data,
  })
  invalidateGlobalConfigCache()

  try {
    const changes = Object.keys(data).map(key => [key, before?.[key], updated[key]])
    for (const [key, prev, next] of changes) {
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        await logAdminChange(db, { userId: me.id, area: 'GlobalGameConfig', key, prevValue: prev, newValue: next })
      }
    }
  } catch {}

  return {
    highScorePoints: updated.cMoonHighScorePoints,
    top10Points: updated.cMoonTop10Points,
    dailyTaskPoints: updated.cMoonDailyTaskPoints,
    minAccountAgeDays: updated.cMoonScoringMinAccountAgeDays,
    top10RankCutoff: updated.cMoonTop10RankCutoff,
    top10PointsBoardEnabled: updated.cMoonTop10PointsBoardEnabled,
    top10CtoonsBoardEnabled: updated.cMoonTop10CtoonsBoardEnabled,
    disabledScoreGames: updated.cMoonDisabledScoreGames,
    disabledWinGames: updated.cMoonDisabledWinGames,
  }
})
