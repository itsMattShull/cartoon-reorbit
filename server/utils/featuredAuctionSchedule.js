// server/utils/featuredAuctionSchedule.js
//
// The featured auction schedule set on Admin > Global Settings > Auctions:
//   featuredAuctionHours         hours of the day (0-23, America/Chicago) that fire
//   featuredAuctionIntervalDays  fire every N days
//   featuredAuctionsPerSlot      featured auctions created each time an hour fires
//
// Each slot lists random eligible cToons held by the official account as 1-day featured
// auctions at the rarity floor. This is its own system: it never takes a cToon that is waiting
// in the dissolve queue or in a pending Auction Only listing, which list on their own schedules.
//
// Run hourly by the cron job runFeaturedAuctionSchedule (server/cron/jobs.js).
import { prisma } from '../prisma.js'
import { scheduleAuctionClose } from './queues.js'
import { rarityFloor } from './auctionPriceSuggestion.js'
import { isAutoAuctionEligibleRarity } from './autoAuctionEligibility.js'
import { isLockedCopy } from './lockRules.js'
import { dueFeaturedSlot } from './featuredAuctionSlot.js'

const DAY_MS = 86_400_000
export const FEATURED_AUCTION_DURATION_DAYS = 1

function shuffle (arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Creates this hour's featured auctions if the hour is scheduled and has not fired yet.
 * @returns {Promise<string|undefined>} a short summary for Cron Run Logs, or undefined when idle
 */
export async function runFeaturedAuctionSchedule (now = new Date()) {
  const username = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

  const config = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      featuredAuctionHours: true,
      featuredAuctionIntervalDays: true,
      featuredAuctionsPerSlot: true
    }
  })
  const due = dueFeaturedSlot(config, now)
  if (!due) return undefined

  const official = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!official) return `Slot ${due.slotKey}: official account "${username}" not found`

  // Claim the slot before creating anything. Only one run can move the key to this slot, so a
  // restart, a catch-up run or two overlapping runs can never fire the same slot twice.
  const { count: claimed } = await prisma.globalGameConfig.updateMany({
    where: {
      id: 'singleton',
      OR: [{ featuredAuctionLastFiredSlot: null }, { featuredAuctionLastFiredSlot: { not: due.slotKey } }]
    },
    data: { featuredAuctionLastFiredSlot: due.slotKey }
  })
  if (!claimed) return undefined

  const owned = await prisma.userCtoon.findMany({
    where: {
      userId: official.id,
      burnedAt: null,
      auctions: { none: { status: 'ACTIVE' } },
      auctionOnlyListings: { none: { isStarted: false } },
      dissolveAuctionQueue: null
    },
    select: { id: true, userId: true, lockedByUserId: true, ctoon: { select: { rarity: true } } }
  })
  const candidates = owned.filter(c => !isLockedCopy(c) && isAutoAuctionEligibleRarity(c.ctoon?.rarity))

  const endAt = new Date(now.getTime() + FEATURED_AUCTION_DURATION_DAYS * DAY_MS)
  let created = 0

  for (const chosen of shuffle(candidates)) {
    if (created >= due.perSlot) break
    const initialBet = rarityFloor(chosen.ctoon?.rarity)

    const auctionId = await prisma.$transaction(async (tx) => {
      // Lock the copy so a concurrent listing of it (admin, Auction Only, dissolve) waits, then
      // re-check it is still ours and not already up for auction.
      await tx.$queryRaw`SELECT id FROM "UserCtoon" WHERE id = ${chosen.id} FOR UPDATE`
      const fresh = await tx.userCtoon.findUnique({
        where: { id: chosen.id },
        select: { userId: true, burnedAt: true }
      })
      if (!fresh || fresh.userId !== official.id || fresh.burnedAt) return null
      const active = await tx.auction.findFirst({
        where: { userCtoonId: chosen.id, status: 'ACTIVE' },
        select: { id: true }
      })
      if (active) return null

      const auction = await tx.auction.create({
        data: {
          userCtoonId: chosen.id,
          initialBet,
          duration: FEATURED_AUCTION_DURATION_DAYS,
          durationMinutes: FEATURED_AUCTION_DURATION_DAYS * 1440,
          endAt,
          creatorId: official.id,
          isFeatured: true
        },
        select: { id: true }
      })
      await tx.userCtoon.update({ where: { id: chosen.id }, data: { isTradeable: false } })
      return auction.id
    })
    if (!auctionId) continue

    created++
    await scheduleAuctionClose(auctionId, endAt)
  }

  return `Slot ${due.slotKey}: created ${created} of ${due.perSlot} featured auction${due.perSlot === 1 ? '' : 's'}` +
    (created < due.perSlot ? ` (${candidates.length} eligible cToon${candidates.length === 1 ? '' : 's'})` : '')
}
