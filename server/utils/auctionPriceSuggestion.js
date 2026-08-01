// server/utils/auctionPriceSuggestion.js
//
// Pricing helpers for the "what has this been selling for?" hint shown in the
// send-to-auction modal. Everything in here is pure so it can be unit-tested
// (see tests/auctionPriceSuggestion.test.js); the queries that feed it live in
// server/api/ctoon/[id]/getRecentAuctions.get.js.

// Minimum initial bid per rarity. This is the authoritative copy — the check in
// server/api/auctions.post.js imports it, and the client mirrors it for display.
export const RARITY_FLOORS = {
  'common': 25,
  'uncommon': 50,
  'rare': 100,
  'very rare': 187,
  'crazy rare': 312,
  'code only': 50,
  'prize only': 50,
  'auction only': 50
}

export const DEFAULT_RARITY_FLOOR = 50

export function rarityFloor(rarity) {
  const key = String(rarity ?? '').trim().toLowerCase()
  return RARITY_FLOORS[key] ?? DEFAULT_RARITY_FLOOR
}

// How far back a sale can be and still count as "recent".
export const RECENT_WINDOW_DAYS = 90

// How many sales the average is built from.
export const MAX_SAMPLE_SIZE = 10

/**
 * Mint-number premium, matching the trade tool (components/newsite/Trade.vue).
 * Mint #1 of 500 -> ~1.998x, mint #500 of 500 -> 1.0x.
 *
 * Returns 1 (no adjustment) when a premium would be meaningless or misleading:
 *  - the cToon has no mint number
 *  - there is only one mint in existence
 *  - the cToon is unlimited-print (quantity null): `highestMint` climbs forever,
 *    so the same mint would silently inflate as more copies are printed
 *  - the cToon is a holiday item: its mint number is deliberately hidden in the
 *    UI, and an adjusted price is invertible back to the mint
 */
export function mintMultiplier(mintNumber, highestMint, opts = {}) {
  const { isUnlimited = false, isHolidayItem = false } = opts
  if (isUnlimited || isHolidayItem) return 1
  if (mintNumber == null || !highestMint || highestMint <= 1) return 1
  if (mintNumber > highestMint) return 1
  return 1 + (highestMint - mintNumber) / highestMint
}

/**
 * True when a closed auction was won by the official/system account rather
 * than by a player.
 *
 * The insta-bid path (server/api/auctions.post.js) places a bid from the
 * official account at exactly the rarity floor. If no player ever outbids it,
 * the auction still closes with a winner, so it looks like a sale at the floor
 * price. Those are buyout floors, not market prices, and leaving them in drags
 * every average down toward the rarity minimum — for free, since the seller is
 * paid out of the system account.
 */
export function isSystemSale(sale, systemUserIds) {
  const winnerId = sale?.winnerId
  if (!winnerId) return false
  if (Array.isArray(systemUserIds)) return systemUserIds.filter(Boolean).includes(winnerId)
  return !!systemUserIds && winnerId === systemUserIds
}

function mean(nums) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * Middle value of the sample. Preferred over the mean for the headline number:
 * a handful of collusive or freak sales can move an average a long way, but
 * they have to make up half the window to move a median.
 */
function median(nums) {
  if (!nums.length) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function stdDev(nums) {
  if (nums.length < 2) return 0
  const m = mean(nums)
  const variance = nums.reduce((acc, n) => acc + (n - m) ** 2, 0) / (nums.length - 1)
  return Math.sqrt(variance)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Half-width of the range, as a fraction of the midpoint.
 *
 * A fixed +/-15% band is fake precision when it's built from one sale, so the
 * band widens with a small sample and with a noisy one:
 *   n=1            -> +/-40%
 *   n=3,  CV=0.20  -> +/-43%
 *   n=10, CV=0.10  -> +/-23%
 */
export function rangeFactor(bases) {
  const n = bases.length
  if (!n) return 0.15
  const m = mean(bases)
  const cv = m > 0 ? stdDev(bases) / m : 0
  return clamp(cv + 0.40 / Math.sqrt(n), 0.15, 0.60)
}

/**
 * Build the price hint.
 *
 * `sales` are already-filtered closed+sold auctions, newest first, each
 * { highestBid, mintNumber }. `cMartPrice` is the fallback when there is no
 * sale history at all.
 *
 * Returns { basis, low, high, mid, sampleSize, windowDays, floor, mintAdjusted }
 * where basis is one of:
 *   'recent'      – built from sales inside the 90-day window
 *   'alltime'     – no recent sales, built from older ones
 *   'estimate'    – no sales at all, using the cMart price
 *   'below_floor' – the market sits under the rarity minimum
 *   'none'        – nothing to go on
 */
export function computePriceSuggestion({
  sales = [],
  cMartPrice = null,
  mintNumber = null,
  highestMint = null,
  isUnlimited = false,
  isHolidayItem = false,
  rarity = null,
  basis = 'recent',
  windowDays = RECENT_WINDOW_DAYS
} = {}) {
  const floor = rarityFloor(rarity)
  const mintOpts = { isUnlimited, isHolidayItem }
  const myMultiplier = mintMultiplier(mintNumber, highestMint, mintOpts)
  const mintAdjusted = myMultiplier !== 1

  const empty = {
    basis: 'none',
    low: null,
    high: null,
    mid: null,
    sampleSize: 0,
    windowDays,
    floor,
    mintAdjusted: false
  }

  const usable = (Array.isArray(sales) ? sales : [])
    .slice(0, MAX_SAMPLE_SIZE)
    .filter(s => Number.isFinite(Number(s?.highestBid)) && Number(s.highestBid) > 0)

  if (!usable.length) {
    if (cMartPrice == null || cMartPrice <= 0) return empty
    // No sale history: the cMart price is a list price, not a sale price, so it
    // gets no mint premium and no invented range.
    const mid = Math.round(cMartPrice)
    return {
      basis: 'estimate',
      low: mid,
      high: mid,
      mid,
      sampleSize: 0,
      windowDays,
      floor,
      mintAdjusted: false
    }
  }

  // Normalise each sale back to a "mint-neutral" base before averaging.
  //
  // Without this the number comes out ~1.5x too high: the average already
  // blends low mints (which sold at a premium) with high ones, and multiplying
  // that average by the premium again applies it twice. Dividing each sale by
  // its own multiplier first means the average is a true base value, and the
  // premium is then applied exactly once, for the mint being listed. The
  // relative gap between mints stays identical to what the trade tool shows.
  const bases = usable.map(s => {
    const mult = mintMultiplier(s.mintNumber, highestMint, mintOpts)
    return Number(s.highestBid) / (mult || 1)
  })

  const base = median(bases)
  const mid = Math.round(base * myMultiplier)
  const factor = rangeFactor(bases)

  let low = Math.round(mid * (1 - factor))
  const high = Math.round(mid * (1 + factor))

  // The whole range sits under the minimum the seller is allowed to enter.
  // Saying so is more useful than showing a range they can't use.
  if (high < floor) {
    return {
      basis: 'below_floor',
      low: floor,
      high: floor,
      mid,
      sampleSize: usable.length,
      windowDays,
      floor,
      mintAdjusted
    }
  }

  // Lift the bottom of the range to the floor, but never push the top down —
  // that would hide real upside.
  low = Math.max(low, floor)

  return {
    basis: basis === 'alltime' ? 'alltime' : 'recent',
    low,
    high,
    mid,
    sampleSize: usable.length,
    windowDays,
    floor,
    mintAdjusted
  }
}
