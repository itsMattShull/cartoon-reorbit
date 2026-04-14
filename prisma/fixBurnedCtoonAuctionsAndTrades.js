// prisma/fixBurnedCtoonAuctionsAndTrades.js
//
// Cleans up data left behind when a holiday cToon was burned but its delete
// failed (FK constraint, etc.), leaving the burned UserCtoon still visible to
// trade and auction endpoints.
//
// For each burned UserCtoon (burnedAt IS NOT NULL):
//   - ACTIVE auctions  → status set to CANCELLED; bids and auto-bids deleted
//   - PENDING trades   → status set to WITHDRAWN; initiator's locked points released
//
// Usage:
//   node prisma/fixBurnedCtoonAuctionsAndTrades.js           # dry run (no writes)
//   node prisma/fixBurnedCtoonAuctionsAndTrades.js --commit  # apply changes

import { prisma } from '../server/prisma.js'

const COMMIT = process.argv.includes('--commit')

async function main() {
  console.log(`[fixBurnedCtoonAuctionsAndTrades] start. commit=${COMMIT}\n`)

  // ── 1. Collect all burned UserCtoon IDs ──────────────────────────────────
  const burnedCtoons = await prisma.userCtoon.findMany({
    where: { burnedAt: { not: null } },
    select: { id: true, burnedAt: true }
  })
  const burnedIds = burnedCtoons.map((uc) => uc.id)
  console.log(`Burned UserCtoons: ${burnedIds.length}`)

  if (burnedIds.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // ── 2. Find active auctions on burned cToons ──────────────────────────────
  const activeAuctions = await prisma.auction.findMany({
    where: { userCtoonId: { in: burnedIds }, status: 'ACTIVE' },
    select: {
      id: true,
      userCtoonId: true,
      _count: { select: { bids: true, autoBids: true } }
    }
  })
  console.log(`Active auctions on burned cToons: ${activeAuctions.length}`)
  for (const a of activeAuctions) {
    console.log(
      `  auction ${a.id}  userCtoonId=${a.userCtoonId}` +
      `  bids=${a._count.bids}  autoBids=${a._count.autoBids}`
    )
  }

  // ── 3. Find pending trades involving burned cToons ────────────────────────
  const pendingTrades = await prisma.tradeOffer.findMany({
    where: {
      status: 'PENDING',
      ctoons: { some: { userCtoonId: { in: burnedIds } } }
    },
    select: {
      id: true,
      initiatorId: true,
      ctoons: { select: { userCtoonId: true, role: true } }
    }
  })
  console.log(`\nPending trades involving burned cToons: ${pendingTrades.length}`)
  for (const t of pendingTrades) {
    const burned = t.ctoons
      .filter((c) => burnedIds.includes(c.userCtoonId))
      .map((c) => `${c.userCtoonId}[${c.role}]`)
      .join(', ')
    console.log(`  trade ${t.id}  initiator=${t.initiatorId}  burned cToons: ${burned}`)
  }

  if (!COMMIT) {
    console.log('\n[fixBurnedCtoonAuctionsAndTrades] dry-run complete. Use --commit to apply.')
    return
  }

  // ── 4. Cancel active auctions + delete their bids ─────────────────────────
  let auctionsCancelled = 0
  let bidsDeleted = 0
  let autoBidsDeleted = 0

  for (const auction of activeAuctions) {
    await prisma.$transaction(async (tx) => {
      const ab = await tx.auctionAutoBid.deleteMany({ where: { auctionId: auction.id } })
      autoBidsDeleted += ab.count

      const b = await tx.bid.deleteMany({ where: { auctionId: auction.id } })
      bidsDeleted += b.count

      await tx.auction.update({
        where: { id: auction.id },
        data: { status: 'CANCELLED' }
      })
    })
    auctionsCancelled++
    console.log(`  Cancelled auction ${auction.id}`)
  }
  console.log(`\nAuctions cancelled:  ${auctionsCancelled}`)
  console.log(`Bids deleted:        ${bidsDeleted}`)
  console.log(`Auto-bids deleted:   ${autoBidsDeleted}`)

  // ── 5. Withdraw pending trades + release locked points ───────────────────
  let tradesWithdrawn = 0
  let lockedReleased = 0

  for (const trade of pendingTrades) {
    await prisma.$transaction(async (tx) => {
      await tx.tradeOffer.update({
        where: { id: trade.id },
        data: { status: 'WITHDRAWN' }
      })

      const lp = await tx.lockedPoints.updateMany({
        where: {
          userId: trade.initiatorId,
          status: 'ACTIVE',
          contextType: 'TRADE',
          contextId: trade.id
        },
        data: { status: 'RELEASED' }
      })
      lockedReleased += lp.count
    })
    tradesWithdrawn++
    console.log(`  Withdrew trade ${trade.id}`)
  }
  console.log(`\nTrades withdrawn:          ${tradesWithdrawn}`)
  console.log(`Locked point records released: ${lockedReleased}`)

  console.log('\n[fixBurnedCtoonAuctionsAndTrades] done.')
}

main()
  .catch((err) => {
    console.error('[fixBurnedCtoonAuctionsAndTrades] fatal:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
