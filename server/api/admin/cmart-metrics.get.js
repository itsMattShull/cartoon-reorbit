// server/api/admin/cmart-metrics.get.js
// Powers the "cMart Metrics" admin page: the active-player/points data an admin needs to pick
// sensible percentages, plus a live preview of what each rarity's mint quantity would be right
// now at the currently-configured percentages. Reuses the exact same functions the cToon create/
// edit endpoints use to actually compute a quantity, so the preview here can never drift from
// what a real save would produce.
import { defineEventHandler } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { getActivePlayerCount, getActivePlayerPointsStats, ACTIVE_PLAYER_WINDOW_DAYS } from '@/server/utils/activePlayers'
import { STANDARDIZABLE_RARITIES, getStandardizedMetricPercentages, computeStandardizedQuantity } from '@/server/utils/cmartStandardizedMetrics'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [activePlayerCount, pointsStats, percentages] = await Promise.all([
    getActivePlayerCount(),
    getActivePlayerPointsStats(),
    getStandardizedMetricPercentages()
  ])

  const preview = STANDARDIZABLE_RARITIES.map(rarity => ({
    rarity,
    percentage: percentages[rarity],
    computedQuantity: computeStandardizedQuantity(rarity, activePlayerCount, percentages)
  }))

  return {
    activePlayerCount,
    activePlayerWindowDays: ACTIVE_PLAYER_WINDOW_DAYS,
    avgPointsPerPlayer: pointsStats.avgPoints,
    medianPointsPerPlayer: pointsStats.medianPoints,
    percentages,
    preview
  }
})
