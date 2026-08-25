// server/api/admin/cmoon-scoring.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { CMOON_SCORING_DEFAULTS, SCORE_GAME_OPTIONS, WIN_GAME_OPTIONS } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const cfg = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const disabledScoreGames = Array.isArray(cfg?.cMoonDisabledScoreGames) ? cfg.cMoonDisabledScoreGames : []
  const disabledWinGames = Array.isArray(cfg?.cMoonDisabledWinGames) ? cfg.cMoonDisabledWinGames : []

  return {
    highScorePoints: cfg?.cMoonHighScorePoints ?? CMOON_SCORING_DEFAULTS.highScorePoints,
    top10Points: cfg?.cMoonTop10Points ?? CMOON_SCORING_DEFAULTS.top10Points,
    dailyTaskPoints: cfg?.cMoonDailyTaskPoints ?? CMOON_SCORING_DEFAULTS.dailyTaskPoints,
    minAccountAgeDays: cfg?.cMoonScoringMinAccountAgeDays ?? CMOON_SCORING_DEFAULTS.minAccountAgeDays,
    top10RankCutoff: cfg?.cMoonTop10RankCutoff ?? CMOON_SCORING_DEFAULTS.top10RankCutoff,
    top10PointsBoardEnabled: cfg?.cMoonTop10PointsBoardEnabled ?? CMOON_SCORING_DEFAULTS.top10PointsBoardEnabled,
    top10CtoonsBoardEnabled: cfg?.cMoonTop10CtoonsBoardEnabled ?? CMOON_SCORING_DEFAULTS.top10CtoonsBoardEnabled,
    disabledScoreGames,
    disabledWinGames,
    scoreGameOptions: SCORE_GAME_OPTIONS,
    winGameOptions: WIN_GAME_OPTIONS,
  }
})
