// server/utils/featuredAuctionSlot.js
//
// Pure slot math for the featured auction schedule (Admin > Global Settings > Auctions). No
// imports, so tests can load it without Prisma or Redis. The job that acts on it lives in
// server/utils/featuredAuctionSchedule.js.

const TZ = 'America/Chicago'
const DAY_MS = 86_400_000
// Day 0 of the "every N days" cycle. Fixed, so the on/off days never shift.
const INTERVAL_EPOCH_DAY = Date.UTC(2025, 0, 1) / DAY_MS

// Chicago wall-clock date and hour for an instant.
export function chicagoParts (date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit'
    }).formatToParts(date).map(p => [p.type, p.value])
  )
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) }
}

/**
 * The slot that should fire at `now`, or null when this hour is not scheduled.
 * @returns {{ slotKey: string, perSlot: number } | null}  slotKey is e.g. "2026-11-23-08"
 */
export function dueFeaturedSlot (config, now = new Date()) {
  const hours = Array.isArray(config?.featuredAuctionHours) ? config.featuredAuctionHours.map(Number) : []
  const perSlot = Math.floor(Number(config?.featuredAuctionsPerSlot ?? 1))
  if (!hours.length || !(perSlot > 0)) return null

  const { year, month, day, hour } = chicagoParts(now)
  if (!hours.includes(hour)) return null

  const intervalDays = Math.max(1, Math.floor(Number(config?.featuredAuctionIntervalDays ?? 1)) || 1)
  const dayNum = Date.UTC(year, month - 1, day) / DAY_MS - INTERVAL_EPOCH_DAY
  if (((dayNum % intervalDays) + intervalDays) % intervalDays !== 0) return null

  const pad = n => String(n).padStart(2, '0')
  return { slotKey: `${year}-${pad(month)}-${pad(day)}-${pad(hour)}`, perSlot }
}
