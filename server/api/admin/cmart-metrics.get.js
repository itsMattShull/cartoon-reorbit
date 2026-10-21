// server/api/admin/cmart-metrics.get.js
// Powers the "cMart Metrics" admin page: the active-player/points data an admin needs to pick
// sensible percentages, plus a live preview of what each rarity's "Fill from Active Players"
// button currently suggests at the configured percentages. Reuses the exact same functions that
// button calls, so the preview here can never drift from what the button actually fills in.
import { defineEventHandler } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { getPriorWeekActivePlayerCount, getPriorWeekActivePlayerPointsStats, PRIOR_WEEK_WINDOW_START_DAYS, PRIOR_WEEK_WINDOW_END_DAYS } from '@/server/utils/activePlayers'
import { STANDARDIZABLE_RARITIES, getStandardizedMetricPercentages, computeStandardizedQuantity } from '@/server/utils/cmartStandardizedMetrics'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [activePlayerCount, pointsStats, percentages] = await Promise.all([
    getPriorWeekActivePlayerCount(),
    getPriorWeekActivePlayerPointsStats(),
    getStandardizedMetricPercentages()
  ])

  const preview = STANDARDIZABLE_RARITIES.map(rarity => ({
    rarity,
    percentage: percentages[rarity],
    computedQuantity: computeStandardizedQuantity(rarity, activePlayerCount, percentages)
  }))

  return {
    activePlayerCount,
    windowStartDaysAgo: PRIOR_WEEK_WINDOW_START_DAYS,
    windowEndDaysAgo: PRIOR_WEEK_WINDOW_END_DAYS,
    avgPointsPerPlayer: pointsStats.avgPoints,
    medianPointsPerPlayer: pointsStats.medianPoints,
    percentages,
    preview
  }
})
