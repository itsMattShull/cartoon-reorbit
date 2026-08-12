// server/utils/autoAuctionEligibility.js
//
// Which of the official account's copies may a *automatic* job pick up and put
// on auction by itself? This is deliberately narrower than "what may an admin
// auction on purpose" — an admin choosing a listing sets its own price, whereas
// the automatic jobs price from the rarity floor and pick their subject at
// random. Pure so it can be unit-tested (see tests/autoAuctionEligibility.test.js).
//
// Background: createDailyFeaturedAuction (server/cron/sync-guild-members.js)
// shuffles the official account's whole inventory and lists what it draws at
// rarityFloor(). It excluded only "Crazy Rare", so it drew a "Gold Edition Edd"
// copy that had been deliberately scheduled through the AuctionOnly system to
// release in mint order at 1500 pts, and listed it at the 50 pt fallback floor
// instead — out of order and at ~3% of the intended price.
import { RARITY_FLOORS } from './auctionPriceSuggestion.js'

// Rarities that only ever reach players through a deliberate release — an admin
// scheduling an AuctionOnly listing, a prize payout, or a redemption code. A
// random job must never pre-empt one of those, whatever its floor happens to be.
export const AUTO_AUCTION_EXCLUDED_RARITIES = [
  'Crazy Rare',
  'Auction Only',
  'Prize Only',
  'Code Only'
]

const EXCLUDED = new Set(AUTO_AUCTION_EXCLUDED_RARITIES.map(r => r.toLowerCase()))

/**
 * May an automatic job list this rarity on its own initiative?
 *
 * Two independent guards, each closing a distinct hole:
 *  1. Deliberate-release rarities are never drawn at random (the list above).
 *  2. A rarity with no *explicit* entry in RARITY_FLOORS is never drawn either.
 *     rarityFloor() answers DEFAULT_RARITY_FLOOR (50) for anything it doesn't
 *     recognise, which is a guess, not a price — and mispricing a collectible at
 *     50 pts is exactly how this went wrong. Null, empty and misspelled
 *     rarities all fail here, which also preserves the pre-existing behaviour
 *     that a NULL rarity never became a featured auction.
 *
 * @param {string|null|undefined} rarity
 * @returns {boolean}
 */
export function isAutoAuctionEligibleRarity(rarity) {
  const key = String(rarity ?? '').trim().toLowerCase()
  if (!key) return false
  if (EXCLUDED.has(key)) return false
  return Object.prototype.hasOwnProperty.call(RARITY_FLOORS, key)
}
