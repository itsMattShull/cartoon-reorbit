// server/scripts/fixAuctions.js
import { prisma } from '../server/prisma.js'

const COMMIT = process.argv.includes('--commit')

async function main() {
  console.log(`[fixAuctions] start. commit=${COMMIT}`)

  // 1) fetch candidate auctions and filter where winnerId === creatorId
  const candidates = await prisma.auction.findMany({
    where: {
      status: 'CLOSED',
      creatorId: { not: null },
      winnerId:  { not: null },
    },
    select: {
      id: true,
      creatorId: true,
      winnerId: true,
      userCtoonId: true,
      highestBid: true,
      winnerAt: true,
      bids: { select: { id: true, amount: true, userId: true }, orderBy: { amount: 'desc' } }
    }
  })

  const bad = candidates.filter(a => a.creatorId === a.winnerId)

  if (!bad.length) {
    console.log('[fixAuctions] no offending auctions found.')
    return
  }

  console.log(`[fixAuctions] offending auctions: ${bad.length}`)
  for (const a of bad) {
    console.log(`  - ${a.id} | userCtoon=${a.userCtoonId} | winner=creator=${a.winnerId} | bids=${a.bids.length} | highestBid=${a.highestBid ?? 0}`)
  }

  if (!COMMIT) {
    console.log('[fixAuctions] dry-run complete. Use --commit to apply.')
    return
  }

  // 2) delete deps + auction in per-auction transactions
  for (const a of bad) {
    try {
      await prisma.$transaction(async (tx) => {
        // unlock the asset to be safe
        await tx.userCtoon.update({
          where: { id: a.userCtoonId },
          data:  { isTradeable: true }
        })

        // children first
        await tx.bid.deleteMany({ where: { auctionId: a.id } })
        await tx.auctionAutoBid.deleteMany({ where: { auctionId: a.id } })

        // finally the auction
        await tx.auction.delete({ where: { id: a.id } })
      })

      console.log(`[fixAuctions] deleted auction ${a.id} and dependencies.`)
    } catch (err) {
      console.error(`[fixAuctions] FAILED for ${a.id}:`, err?.message || err)
    }
  }

  console.log('[fixAuctions] done.')
}

main()
  .catch((err) => {
    console.error('[fixAuctions] fatal:', err)
    process.exit(1)
  })
  .finally(() => {})
