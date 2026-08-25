// prisma/backfillLastAuctionSold.js
// One-time backfill for Ctoon.lastAuctionSoldPrice / lastAuctionSoldAt, run
// once after the migration that adds those columns. Safe to re-run by hand —
// it always recomputes from the Auction table rather than trusting whatever
// is currently stored, so a partial or interrupted run just gets overwritten
// on the next pass.
//
// Usage:
//   node prisma/backfillLastAuctionSold.js

import { prisma } from '../server/prisma.js'

async function main() {
  console.log('🔢 Backfilling Ctoon.lastAuctionSoldPrice / lastAuctionSoldAt…')
  const count = await prisma.$executeRaw`
    UPDATE "Ctoon" c
    SET "lastAuctionSoldPrice" = sub."highestBid",
        "lastAuctionSoldAt"    = sub."endAt"
    FROM (
      SELECT DISTINCT ON (uc."ctoonId") uc."ctoonId", a."highestBid", a."endAt"
      FROM "Auction" a
      JOIN "UserCtoon" uc ON uc.id = a."userCtoonId"
      WHERE a.status = 'CLOSED' AND a."winnerId" IS NOT NULL
      ORDER BY uc."ctoonId", a."endAt" DESC
    ) sub
    WHERE c.id = sub."ctoonId"
  `
  console.log(`✅ Done. ${count} cToon(s) updated.`)
}

main()
  .catch(err => {
    console.error('❌ Unexpected error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
