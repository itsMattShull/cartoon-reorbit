// server/utils/dissolveListing.js
//
// Which dissolve-queue entries can be auto-auctioned, and at what starting bid. Pure (no Prisma,
// no BullMQ) so the scheduler (dissolveSchedule.js), the launch worker
// (workers/dissolve-auction-launch.worker.js), the manual reschedule endpoint and the admin page
// all share ONE rule and can't drift apart. See tests/dissolveListing.test.js.
//
// Why this exists: Auction Only / Prize Only / Code Only / Crazy Rare cToons have no meaningful
// rarity floor (see autoAuctionEligibility.js), so the launch worker used to skip them silently,
// resetting the entry to "unscheduled". The scheduler then handed those same entries the EARLIEST
// slots again on the next Apply Schedule, so a queue made mostly of them (dissolved collections
// are full of Code Only / Prize Only items) launched nothing at all, however high the daily rate
// was set. Now:
//   - an admin sets a starting bid per special rarity on the Dissolve Queue page, and entries of
//     that rarity auction at it (no Auction Only page needed); and
//   - a special-rarity entry WITHOUT a starting bid is "held": it stays in the queue, visible, but
//     never takes a schedule slot, so it can't starve the entries that can launch.
import { RARITY_FLOORS, rarityFloor } from './auctionPriceSuggestion.js'
import { isAutoAuctionEligibleRarity } from './autoAuctionEligibility.js'

// rarity (lower-case) -> GlobalGameConfig column holding the admin's starting bid for it.
export const SPECIAL_RARITY_BID_FIELDS = Object.freeze({
  'auction only': 'dissolveStartBidAuctionOnly',
  'prize only': 'dissolveStartBidPrizeOnly',
  'code only': 'dissolveStartBidCodeOnly',
  'crazy rare': 'dissolveStartBidCrazyRare',
})

// Display names, in the order the admin page lists them.
export const SPECIAL_RARITY_LABELS = Object.freeze({
  'auction only': 'Auction Only',
  'prize only': 'Prize Only',
  'code only': 'Code Only',
  'crazy rare': 'Crazy Rare',
})

export const MAX_DISSOLVE_START_BID = 10_000_000

function rarityKey(rarity) {
  return String(rarity ?? '').trim().toLowerCase()
}

export function isSpecialDissolveRarity(rarity) {
  return Object.prototype.hasOwnProperty.call(SPECIAL_RARITY_BID_FIELDS, rarityKey(rarity))
}

// The lowest starting bid an admin may set for a special rarity — the same per-rarity floor a
// player listing has to clear (RARITY_FLOORS), so a typo can't list a Crazy Rare for 5 points.
export function minStartBidFor(rarity) {
  return RARITY_FLOORS[rarityKey(rarity)] ?? 1
}

// `startBids`: { [GlobalGameConfig column]: number|null } — e.g. getDissolveScheduleConfig().startBids.
// Returns the starting bid this entry would auction at, or null when it can't be auto-listed
// (held: a special rarity with no valid bid set, or an unrecognized/blank rarity).
export function dissolveStartingBid(rarity, startBids = {}) {
  const key = rarityKey(rarity)
  if (!key) return null
  const field = SPECIAL_RARITY_BID_FIELDS[key]
  if (field) {
    const bid = Number(startBids?.[field])
    if (!Number.isInteger(bid) || bid < minStartBidFor(key) || bid > MAX_DISSOLVE_START_BID) return null
    return bid
  }
  return isAutoAuctionEligibleRarity(key) ? rarityFloor(key) : null
}

export function isDissolveListable(rarity, startBids) {
  return dissolveStartingBid(rarity, startBids) !== null
}

// Validates an admin's starting-bid form. Blank/null clears a bid (that rarity goes back to being
// held). Returns { data } ready for prisma.globalGameConfig.update, or { error }.
export function parseStartBidsInput(input = {}) {
  const data = {}
  for (const [key, field] of Object.entries(SPECIAL_RARITY_BID_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue
    const raw = input[field]
    if (raw === null || raw === '' || raw === undefined) { data[field] = null; continue }
    const n = Number(raw)
    const min = minStartBidFor(key)
    if (!Number.isInteger(n) || n < min || n > MAX_DISSOLVE_START_BID) {
      return { error: `${SPECIAL_RARITY_LABELS[key]} starting bid must be a whole number from ${min} to ${MAX_DISSOLVE_START_BID.toLocaleString('en-US')}, or blank to hold them` }
    }
    data[field] = n
  }
  return { data }
}

// Which past-due entries the recovery sweep should launch again. A launch is a BullMQ delayed job;
// if Redis loses it (restart without persistence), it fails once, or a stale-job deferral couldn't
// re-add it (scheduleDissolveAuctionLaunch no-ops while the same job id is active), the entry
// stays "scheduled" in the past forever — and Apply Schedule never touches already-scheduled
// entries. `entries`: [{ id, scheduledFor }], `jobs`: Map(id -> { state, finishedOn } | undefined).
//   missing / completed            -> requeue (nothing will ever run it otherwise)
//   failed, finished > retryMs ago -> requeue (retry a failure at most once per retryMs; it's also
//                                     in the Errors log, so a persistent error doesn't spin)
//   waiting / delayed / active     -> leave (it will run, or is running)
export function pickOverdueLaunches(entries, jobs, { now = Date.now(), graceMs = 5 * 60 * 1000, retryMs = 60 * 60 * 1000 } = {}) {
  const out = []
  for (const e of entries || []) {
    if (!e?.scheduledFor) continue
    const due = new Date(e.scheduledFor).getTime()
    if (!Number.isFinite(due) || due > now - graceMs) continue
    const job = jobs?.get(e.id)
    const state = job?.state || 'missing'
    if (state === 'missing' || state === 'unknown' || state === 'completed') out.push(e.id)
    else if (state === 'failed' && (!job.finishedOn || now - job.finishedOn > retryMs)) out.push(e.id)
  }
  return out
}
