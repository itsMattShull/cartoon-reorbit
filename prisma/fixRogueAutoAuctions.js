// prisma/fixRogueAutoAuctions.js
//
// Finds live auctions that pre-empted a scheduled AuctionOnly release, and
// retires the ones that can be retired safely.
//
// createDailyFeaturedAuction (server/cron/sync-guild-members.js) used to shuffle
// the official account's entire inventory and list whatever it drew at
// rarityFloor(). It excluded only "Crazy Rare" and did not check whether a copy
// was already committed to a pending AuctionOnly listing, so it could take a
// copy an admin had scheduled to release in mint order at a set price and put it
// up early at the 50 pt fallback floor instead. Both holes are now closed, but
// any auction it already created is still live.
//
// An offender is an ACTIVE auction whose UserCtoon also has a pending
// (isStarted = false) AuctionOnly row: the copy is up for sale right now AND
// still scheduled to be released later.
//
// What --apply does, per offender, mirroring the safe-removal path in
// server/api/admin/auction-only/[id].delete.js:
//   * refuses any auction carrying real transaction history — bids, max-bid
//     settings, or a highest bidder. Points are locked against those (see
//     LockedPoints, contextType 'AUCTION'), and LockedPoints has no foreign key
//     to Auction, so deleting one would strand ACTIVE locks and permanently
//     freeze a player's balance. Those need a human decision about refunds.
//   * cancels the BullMQ auto-close job first, and skips the auction if that job
//     is mid-flight.
//   * deletes the auction and restores isTradeable, leaving the pending
//     AuctionOnly row untouched so the intended release still fires on schedule.
//
// Idempotent: re-running finds nothing once the offenders are cleared.
//
// Usage:
//   node prisma/fixRogueAutoAuctions.js            (dry-run, no changes)
//   node prisma/fixRogueAutoAuctions.js --apply    (retire the safe offenders)

import dotenv from 'dotenv'
dotenv.config()

import { prisma } from '../server/prisma.js'
import { cancelAuctionClose } from '../server/utils/queues.js'
import { isAutoAuctionEligibleRarity } from '../server/utils/autoAuctionEligibility.js'

const APPLY = process.argv.includes('--apply')
const LOG = '[fixRogueAutoAuctions]'

async function main() {
  // Pending listings first — this table is small, and it bounds everything after
  // it. Anything not scheduled for release cannot have been pre-empted.
  const pending = await prisma.auctionOnly.findMany({
    where: { isStarted: false },
    select: {
      id: true,
      userCtoonId: true,
      pricePoints: true,
      startsAt: true,
      userCtoon: {
        select: {
          mintNumber: true,
          user: { select: { username: true } },
          ctoon: { select: { name: true, rarity: true } }
        }
      }
    }
  })

  if (!pending.length) {
    console.log(`${LOG} no pending AuctionOnly listings — nothing to check.`)
    return
  }

  const scheduled = new Map(pending.map(p => [p.userCtoonId, p]))

  const offenders = await prisma.auction.findMany({
    where: {
      status: 'ACTIVE',
      userCtoonId: { in: Array.from(scheduled.keys()) }
    },
    select: {
      id: true,
      userCtoonId: true,
      initialBet: true,
      highestBid: true,
      highestBidderId: true,
      isFeatured: true,
      endAt: true,
      createdAt: true,
      _count: { select: { bids: true, autoBids: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  console.log(
    `${LOG} ${pending.length} pending listing(s); ` +
    `${offenders.length} live auction(s) pre-empting one.`
  )
  if (!offenders.length) return

  let retired = 0
  let blocked = 0

  for (const auction of offenders) {
    const listing = scheduled.get(auction.userCtoonId)
    const ctoon = listing.userCtoon?.ctoon
    const label =
      `${ctoon?.name ?? 'unknown'} #${listing.userCtoon?.mintNumber ?? '?'} ` +
      `(${ctoon?.rarity ?? 'no rarity'})`

    const hasHistory =
      auction._count.bids > 0 || auction._count.autoBids > 0 || !!auction.highestBidderId

    console.log(
      `\n${LOG} ${label}\n` +
      `    auction ${auction.id} — start ${auction.initialBet} pts, ` +
      `highest ${auction.highestBid ?? 0} pts, ${auction._count.bids} bid(s), ` +
      `${auction._count.autoBids} max-bid(s), ends ${auction.endAt.toISOString()}\n` +
      `    scheduled listing ${listing.id} — ${listing.pricePoints} pts, ` +
      `starts ${listing.startsAt.toISOString()}, owner ${listing.userCtoon?.user?.username ?? 'unknown'}` +
      (isAutoAuctionEligibleRarity(ctoon?.rarity)
        ? ''
        : `\n    note: this rarity is no longer auto-auctionable`)
    )

    if (hasHistory) {
      blocked++
      console.log(
        `    SKIP: has real transaction history. Players have points locked ` +
        `against this auction; refund/resolve it by hand, then re-run.`
      )
      continue
    }

    if (!APPLY) {
      console.log(`    would retire this auction and restore the copy to the schedule.`)
      continue
    }

    // Stop the auto-close job before touching the row. If it is mid-flight the
    // auction may be closing right now — leave it alone rather than race it.
    const jobState = await cancelAuctionClose(auction.id)
    if (jobState.active) {
      blocked++
      console.log(`    SKIP: its auction-close job is processing right now. Re-run shortly.`)
      continue
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.auctionAutoBid.deleteMany({ where: { auctionId: auction.id } })
        await tx.bid.deleteMany({ where: { auctionId: auction.id } })

        // Re-assert ACTIVE inside the transaction: a bid or a close landing
        // between the read above and here must abort the whole thing.
        const deleted = await tx.auction.deleteMany({
          where: { id: auction.id, status: 'ACTIVE', highestBidderId: null }
        })
        if (deleted.count !== 1) {
          throw new Error('auction changed concurrently (a bid landed or it closed)')
        }

        await tx.userCtoon.updateMany({
          where: { id: auction.userCtoonId },
          data: { isTradeable: true }
        })
      })
      retired++
      console.log(`    retired. Listing ${listing.id} will release as scheduled.`)
    } catch (err) {
      blocked++
      console.log(`    SKIP: ${err?.message || String(err)}`)
    }
  }

  console.log(
    `\n${LOG} ${retired} retired, ${blocked} left for manual handling.` +
    (APPLY ? '' : `\n${LOG} dry-run complete. Use --apply to apply.`)
  )
}

main()
  .then(async () => {
    await prisma.$disconnect()
    // Importing queues.js for cancelAuctionClose constructs BullMQ Queue objects,
    // whose Redis connections hold the event loop open. Nothing here is still
    // pending at this point, so exit rather than hang.
    process.exit(0)
  })
  .catch(async err => {
    console.error(`${LOG} failed:`, err)
    await prisma.$disconnect().catch(() => {})
    process.exit(1)
  })
