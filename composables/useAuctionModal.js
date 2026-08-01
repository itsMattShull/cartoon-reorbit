// The durations the modal offers, in minutes.
const DURATION_CHOICES = [
  { preset: '3m',   timeframe: 1, minutes: 3 },
  { preset: '30m',  timeframe: 1, minutes: 30 },
  { preset: '1h',   timeframe: 1, minutes: 60 },
  { preset: '4h',   timeframe: 1, minutes: 240 },
  { preset: '6h',   timeframe: 1, minutes: 360 },
  { preset: '12h',  timeframe: 1, minutes: 720 },
  ...[1, 2, 3, 4, 5].map(d => ({ preset: 'days', timeframe: d, minutes: d * 1440 }))
]

const DEFAULT_DURATION = { preset: 'days', timeframe: 1 }

/**
 * Work out which duration preset a finished auction was listed under.
 *
 * Auction.duration only stores whole days, so every sub-day listing records a 0
 * and the real length has to come from endAt - createdAt. That delta can't be
 * trusted verbatim: when the server is down across an auction's end time it
 * extends endAt by the whole outage (server/socket-server.js), and that happens
 * regardless of whether anyone bid. Snapping to the nearest offered preset
 * absorbs the drift and keeps the value inside what the server will accept.
 */
export function reconstructDurationPrefill(createdAt, endAt) {
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
   * @param prefill  optional { initialBet, durationPreset, timeframe, isRelist }
   *                 used when re-listing something that didn't sell
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
