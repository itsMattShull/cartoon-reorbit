// deleteCtoonsByName.js
import { prisma } from '../server/prisma.js'
import { createError } from 'h3'
import { mintQueue } from '../../../server/utils/queues'  // if needed elsewhere
import { QueueEvents } from 'bullmq'

// Deletes a single cToon and all its dependent records
async function deleteCtoonAndDependencies(ctoonId) {
  await prisma.$transaction(async tx => {
    // 1. Claim-code prerequisites
    await tx.claimCodePrerequisite.deleteMany({ where: { ctoonId } })

    // 2. RewardCtoons & PackCtoonOptions
    await tx.rewardCtoon.deleteMany({ where: { ctoonId } })
    await tx.packCtoonOption.deleteMany({ where: { ctoonId } })

    // 3. Wishlist items
    await tx.wishlistItem.deleteMany({ where: { ctoonId } })

    // 4. All UserCtoons for this Ctoon
    const userCtoons = await tx.userCtoon.findMany({
      where: { ctoonId },
      select: { id: true }
    })
    const ucIds = userCtoons.map(u => u.id)

    if (ucIds.length) {
      // 4a. Trade-offer items
      await tx.tradeOfferCtoon.deleteMany({ where: { userCtoonId: { in: ucIds } } })
      // 4b. TradeCtoons
      await tx.tradeCtoon.deleteMany({ where: { userCtoonId: { in: ucIds } } })

      // 4c. Auctions and their bids
      const auctions = await tx.auction.findMany({
        where: { userCtoonId: { in: ucIds } },
        select: { id: true }
      })
      const aucIds = auctions.map(a => a.id)
      if (aucIds.length) {
        await tx.bid.deleteMany({ where: { auctionId: { in: aucIds } } })
        await tx.auction.deleteMany({ where: { id: { in: aucIds } } })
      }

      // 4d. Finally delete UserCtoons
      await tx.userCtoon.deleteMany({ where: { id: { in: ucIds } } })
    }

    // 5. Any GameConfig entries pointing to this as grand prize
    await tx.gameConfig.deleteMany({ where: { grandPrizeCtoonId: ctoonId } })

    // 6. And now the Ctoon itself
    await tx.ctoon.delete({ where: { id: ctoonId } })
  })
}

async function main() {
  try {
    // 0. Find all cToons whose name starts with "Do not use - "
    const toDelete = await prisma.ctoon.findMany({
      where: { name: { startsWith: 'Do not use - ' } },
      select: { id: true, name: true }
    })

    if (toDelete.length === 0) {
      console.log('No cToons found with name starting "Do not use - "')
      return
    }

    for (const { id, name } of toDelete) {
      try {
        console.log(`Deleting cToon ${id} (${name})…`)
        await deleteCtoonAndDependencies(id)
        console.log(`✅ Successfully deleted ${id}`)
      } catch (err) {
        console.error(`❌ Failed to delete ${id}:`, err)
      }
    }
  } catch (err) {
    console.error('Error fetching cToons to delete:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
