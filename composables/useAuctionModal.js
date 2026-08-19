import { MIN_AUCTION_MINUTES, MAX_AUCTION_MINUTES } from '~/server/utils/auctionDuration'

// The durations the modal's preset chips offer, in minutes. The days entries
// must track the picker's slider ceiling — while this table stopped at 5 and the
// cap was 7, every 6- and 7-day auction that fell through to the snapping path
// below silently came back as a 5-day re-list.
const DURATION_CHOICES = [
  { preset: '3m',   timeframe: 1, minutes: 3 },
  { preset: '30m',  timeframe: 1, minutes: 30 },
  { preset: '1h',   timeframe: 1, minutes: 60 },
  { preset: '4h',   timeframe: 1, minutes: 240 },
  { preset: '6h',   timeframe: 1, minutes: 360 },
  { preset: '12h',  timeframe: 1, minutes: 720 },
  ...[1, 2, 3, 4, 5, 6, 7].map(d => ({ preset: 'days', timeframe: d, minutes: d * 1440 }))
]

const DEFAULT_DURATION = { preset: 'days', timeframe: 1 }

/**
 * Work out what duration to prefill when re-listing a finished auction.
 *
 * Prefers the exact listed length from Auction.durationMinutes. That column
 * exists because endAt is not a record of how long the auction was listed for:
 * when the server is down across an auction's end time it extends endAt by the
 * whole outage (server/socket-server.js), so endAt - createdAt overstates it.
 *
 * Rows created before the column existed, and those created by the admin and
 * worker paths, read as null and fall back to snapping the delta to the nearest
 * offered preset — lossy, but bounded and always inside what the server accepts.
 * (Anti-snipe also moves endAt, but it can't affect this: re-listing is only
 * offered on auctions that closed with zero bids, so anti-snipe never fired.)
 *
 * @param createdAt        auction start
 * @param endAt            auction end, possibly extended
 * @param durationMinutes  exact listed length, when the row has one
 */
export function reconstructDurationPrefill(createdAt, endAt, durationMinutes = null) {
  const exact = Number(durationMinutes)
  if (Number.isInteger(exact) && exact >= MIN_AUCTION_MINUTES && exact <= MAX_AUCTION_MINUTES) {
    const match = DURATION_CHOICES.find(c => c.minutes === exact)
    if (match) return { preset: match.preset, timeframe: match.timeframe }
    // Not one of the chips — reopen the calendar seeded to the same length.
    return { preset: 'custom', timeframe: 1, customMinutes: exact }
  }

  const start = new Date(createdAt).getTime()
  const end   = new Date(endAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ...DEFAULT_DURATION }

  const minutes = (end - start) / 60000
  if (!(minutes > 0)) return { ...DEFAULT_DURATION }

  let best = DURATION_CHOICES[0]
  for (const choice of DURATION_CHOICES) {
    if (Math.abs(choice.minutes - minutes) < Math.abs(best.minutes - minutes)) best = choice
  }
  return { preset: best.preset, timeframe: best.timeframe }
}

// Shared state for the "Send to Auction" modal.
//
// The modal is mounted once in layouts/newsite-template.vue and opened from
// anywhere (My Collection, the Auction House "My Auctions" tab, an auction's
// detail page), mirroring how useCtoonModal drives CtoonInfoCard.
export function useAuctionModal() {
  const isOpen  = useState('auction-modal-open', () => false)
  const ctoon   = useState('auction-modal-ctoon', () => null)
  const prefill = useState('auction-modal-prefill', () => null)
  // Bumped after a successful listing so open pages can refresh themselves
  // without the opener having to hold on to a callback. `lastCreated` carries
  // the userCtoonId that was just listed.
  const createdSignal = useState('auction-modal-created-signal', () => 0)
  const lastCreated   = useState('auction-modal-last-created', () => null)

  /**
   * @param ctoon    the cToon being listed; needs at least { id, ctoonId, name,
   *                 assetPath, rarity, mintNumber }
   * @param prefill  optional { initialBet, durationPreset, timeframe,
   *                 customEndAtLocal, isRelist } used when re-listing
   *                 something that didn't sell
   */
  function open({ ctoon: nextCtoon, prefill: nextPrefill = null } = {}) {
    if (!nextCtoon) return
    ctoon.value   = nextCtoon
    prefill.value = nextPrefill
    isOpen.value  = true
  }

  function close() {
    isOpen.value  = false
    ctoon.value   = null
    prefill.value = null
  }

  function notifyCreated(userCtoonId = null) {
    lastCreated.value = userCtoonId
    createdSignal.value += 1
  }

  return {
    isOpen, ctoon, prefill, createdSignal, lastCreated,
    open, close, notifyCreated
  }
}
