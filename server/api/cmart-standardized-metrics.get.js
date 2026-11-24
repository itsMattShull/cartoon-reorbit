// server/api/cmart-standardized-metrics.get.js (public, mirrors server/api/rarity-defaults.get.js)
// Powers the "Fill from Active Players" button on the Add/Edit cToon forms — no admin gate, same
// precedent as rarity-defaults.get.js, since it's read-only, non-sensitive config.
import { defineEventHandler } from 'h3'
import { getStandardizedMetricPercentages, getFillActivePlayerCount } from '@/server/utils/cmartStandardizedMetrics'

export default defineEventHandler(async () => {
  const [percentages, fill] = await Promise.all([
    getStandardizedMetricPercentages(),
    getFillActivePlayerCount()
  ])
  return {
    percentages,
    // Kept as `activePlayerCount`/`windowDays` for the Fill button's existing math/label — the
    // number here is whichever source getFillActivePlayerCount() resolved to, not necessarily the
    // true active-player count. `fillActivePlayerCountSource` says which one it is.
    activePlayerCount: fill.count,
    windowDays: fill.windowDays,
    fillActivePlayerCountSource: fill.source
  }
})
