// server/api/cmart-standardized-metrics.get.js (public, mirrors server/api/rarity-defaults.get.js)
// Powers the live quantity preview on the Add/Edit cToon forms as the admin types — no admin gate,
// same precedent as rarity-defaults.get.js, since it's read-only, non-sensitive config.
import { defineEventHandler } from 'h3'
import { getStandardizedMetricPercentages } from '@/server/utils/cmartStandardizedMetrics'
import { getActivePlayerCount, ACTIVE_PLAYER_WINDOW_DAYS } from '@/server/utils/activePlayers'

export default defineEventHandler(async () => {
  const [percentages, activePlayerCount] = await Promise.all([
    getStandardizedMetricPercentages(),
    getActivePlayerCount()
  ])
  return { percentages, activePlayerCount, activePlayerWindowDays: ACTIVE_PLAYER_WINDOW_DAYS }
})
