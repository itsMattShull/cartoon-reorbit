// server/scripts/delete-starter-mints.js
// Deletes ALL UserCtoon "mints" for any cToon that is included in a StarterSet.
// Order matters: delete children (bids/auctions/trades) before UserCtoon rows.

import { prisma } from '../server/prisma.js'

async function run() {
  const del = async (label, fn) => {
    try {
      const res = await fn()
      console.log(`• ${label}: deleted ${res.count}`)
      return res.count || 0
    } catch (e) {
      console.error(`✗ ${label}:`, e.message)
      throw e
    }
  }

  try {
    console.log('🧹 Deleting mints for all starter-set cToons...\n')

    // 1) Get DISTINCT ctoonIds from all starter sets (active or not).
    const starterCtoonRows = await prisma.starterSetItem.findMany({
      select: { ctoonId: true },
      distinct: ['ctoonId'],
      // If you only want ACTIVE sets, uncomment:
      // where: { set: { isActive: true } }
    })
    const starterCtoonIds = starterCtoonRows.map(r => r.ctoonId)

    if (!starterCtoonIds.length) {
      console.log('No starter-set cToons found. Nothing to delete.')
      return
    }
    console.log(`Found ${starterCtoonIds.length} starter-set cToon IDs.`)

    // 2) All UserCtoon ids that reference those cToons (the "mints" to remove).
    const userCtoons = await prisma.userCtoon.findMany({
      where: { ctoonId: { in: starterCtoonIds } },
      select: { id: true },
    })
    const userCtoonIds = userCtoons.map(u => u.id)
    if (!userCtoonIds.length) {
      console.log('No UserCtoon rows (mints) exist for these cToons. Nothing to delete.')
      return
    }
    console.log(`Will delete ${userCtoonIds.length} UserCtoon mints.\n`)

    // 3) Delete dependents in FK-safe order.
    // 3a) Bids for any Auction whose userCtoonId is in our list
    await del('Bid', () =>
      prisma.bid.deleteMany({
        where: { auction: { userCtoonId: { in: userCtoonIds } } }
      })
    )

    // 3b) Auctions tied to those UserCtoons
    await del('Auction', () =>
      prisma.auction.deleteMany({
        where: { userCtoonId: { in: userCtoonIds } }
      })
    )

    // 3c) TradeOfferCtoon items referencing those UserCtoons
    await del('TradeOfferCtoon', () =>
      prisma.tradeOfferCtoon.deleteMany({
        where: { userCtoonId: { in: userCtoonIds } }
      })
    )

    // 3d) TradeCtoon items referencing those UserCtoons
    await del('TradeCtoon', () =>
      prisma.tradeCtoon.deleteMany({
        where: { userCtoonId: { in: userCtoonIds } }
      })
    )

    // 4) Finally, delete the actual mints
    await del('UserCtoon', () =>
      prisma.userCtoon.deleteMany({
        where: { id: { in: userCtoonIds } }
      })
    )

    console.log('\n✅ Done: all mints for starter-set cToons have been removed.')
  } catch (err) {
    console.error('\n❌ Failed:', err)
    process.exitCode = 1
  } finally {
    // no explicit disconnect
  }
}

run()
