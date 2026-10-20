// utils/cmartStandardizedRarities.js
//
// The only rarities "Standardize Metric in cMart" ever applies to — the ones that can actually
// appear in cMart at all (Prize Only/Code Only/Auction Only never do). Isomorphic (no server-only
// imports) so both server/utils/cmartStandardizedMetrics.js and the Add/Edit cToon forms / cMart
// Metrics admin page import this single copy instead of each hand-duplicating the list.
export const STANDARDIZABLE_RARITIES = ['Crazy Rare', 'Very Rare', 'Rare', 'Uncommon', 'Common']

export function isStandardizableRarity(rarity) {
  return STANDARDIZABLE_RARITIES.includes(rarity)
}
