// server/api/cmart-standardized-metrics.get.js (public, mirrors server/api/rarity-defaults.get.js)
// Powers the "Fill from Active Players" button on the Add/Edit cToon forms — no admin gate, same
// precedent as rarity-defaults.get.js, since it's read-only, non-sensitive config.
import { defineEventHandler } from 'h3'
import { getStandardizedMetricPercentages } from '@/server/utils/cmartStandardizedMetrics'
import { getPriorWeekActivePlayerCount, PRIOR_WEEK_WINDOW_START_DAYS, PRIOR_WEEK_WINDOW_END_DAYS } from '@/server/utils/activePlayers'

export default defineEventHandler(async () => {
  const [percentages, activePlayerCount] = await Promise.all([
    getStandardizedMetricPercentages(),
    getPriorWeekActivePlayerCount()
  ])
  return {
    percentages,
    activePlayerCount,
    windowStartDaysAgo: PRIOR_WEEK_WINDOW_START_DAYS,
    windowEndDaysAgo: PRIOR_WEEK_WINDOW_END_DAYS
  }
})
