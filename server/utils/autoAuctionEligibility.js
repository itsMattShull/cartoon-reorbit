// server/utils/autoAuctionEligibility.js
//
// Rarity gate for the auto-listing systems (daily featured auction,
// dissolve-queue launch): the only paths that pick a cToon to auction off
// with nobody reviewing the choice first.
//
// Auction Only / Prize Only / Code Only cToons are never meant to be sold at
// a plain rarity-floor price — Auction Only items already have their own
// admin-curated listing flow, and Prize/Code Only items have no market price
// to floor against. Crazy Rare is excluded because those are one-of-a-kind
// and too valuable to auto-list. Anything else must have an explicit entry
// in RARITY_FLOORS: silently falling back to DEFAULT_RARITY_FLOOR for an
// unrecognized rarity is exactly what let unpriced items get auto-listed at
// 50pts.
import { RARITY_FLOORS } from './auctionPriceSuggestion.js'

const AUTO_AUCTION_EXCLUDED_RARITIES = new Set([
  'auction only',
  'prize only',
  'code only',
  'crazy rare'
])

export function isAutoAuctionEligibleRarity(rarity) {
  const key = String(rarity ?? '').trim().toLowerCase()
  if (!key) return false
  if (AUTO_AUCTION_EXCLUDED_RARITIES.has(key)) return false
  return Object.prototype.hasOwnProperty.call(RARITY_FLOORS, key)
}
