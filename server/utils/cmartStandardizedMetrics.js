// server/utils/cmartStandardizedMetrics.js
//
// "Standardize Metric in cMart" computes a cToon's mint quantity from the current active-player
// count (server/utils/activePlayers.js) and a per-rarity percentage, instead of an admin hand-
// typing a number — so supply scales with the real population instead of a guess that goes stale
// as the player base grows or shrinks. Percentages are admin-configurable on the "cMart Metrics"
// page (server/api/admin/cmart-metrics.get.js / .post.js), stored the same way
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
 * Pure function: the mint quantity for a standardizable rarity. Returns null for a rarity this
 * doesn't apply to (caller decides what that means — for the cToon create/edit endpoints it's a
 * validation error, since the toggle should never have been settable there in the first place).
 *
 * `floorAt` keeps the result from coming out lower than some caller-supplied minimum — used by
 * the edit endpoint so a drop in the active-player count since a cToon was created can never
 * silently shrink its quantity below how many copies have already been minted.
 */
export function computeStandardizedQuantity(rarity, activePlayerCount, percentages, { floorAt } = {}) {
  if (!isStandardizableRarity(rarity)) return null
  const percent = Number(percentages?.[rarity])
  if (!Number.isFinite(percent)) return null
  const raw = Math.round((Number(activePlayerCount) || 0) * percent / 100)
  const minimum = Math.max(1, Number.isFinite(floorAt) ? floorAt : 1)
  return Math.max(minimum, raw)
}
