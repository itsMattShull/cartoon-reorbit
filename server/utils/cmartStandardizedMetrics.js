// server/utils/cmartStandardizedMetrics.js
//
// Backs the "Fill from Active Players" button on the Add/Edit cToon forms: a one-time suggestion
// for Total/Initial Quantity, computed from the prior-week active-player count
// (server/utils/activePlayers.js) and a per-rarity percentage, instead of an admin guessing a
// number that goes stale as the player base grows or shrinks. The button only fills the fields —
// they're ordinary editable inputs afterward, and nothing is enforced server-side at save time.
// Percentages are admin-configurable on the "cMart Metrics" page
// (server/api/admin/cmart-metrics.get.js / .post.js), stored the same way
// GlobalGameConfig.rarityDefaults already is: a Json? column merged with hardcoded fallback
// defaults (see server/api/rarity-defaults.get.js for the sibling pattern).
import { prisma } from '../prisma.js'
import { STANDARDIZABLE_RARITIES, isStandardizableRarity } from '../../utils/cmartStandardizedRarities.js'

export { STANDARDIZABLE_RARITIES, isStandardizableRarity }

// Whole percentages (50 = 50% = 0.5x), matching how these were specified: "Crazy Rare — this is
// .5 the amount of active players" etc.
export const DEFAULT_PERCENTAGES = {
  'Crazy Rare': 50,
  'Very Rare': 75,
  'Rare': 90,
  'Uncommon': 125,
  'Common': 150
}

/** Merges the admin-configured overrides with the hardcoded defaults above. */
export async function getStandardizedMetricPercentages() {
  const row = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { cmartStandardizedMetrics: true }
  })
  return { ...DEFAULT_PERCENTAGES, ...(row?.cmartStandardizedMetrics || {}) }
}

/**
 * Pure function: the suggested mint quantity for a standardizable rarity. Returns null for a
 * rarity this doesn't apply to (the Add/Edit cToon forms hide the fill button in that case, so
 * this is a defensive fallback, not a validation path — nothing is enforced server-side).
 */
export function computeStandardizedQuantity(rarity, activePlayerCount, percentages) {
  if (!isStandardizableRarity(rarity)) return null
  const percent = Number(percentages?.[rarity])
  if (!Number.isFinite(percent)) return null
  return Math.max(1, Math.round((Number(activePlayerCount) || 0) * percent / 100))
}
