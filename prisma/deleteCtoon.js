// deleteCtoonsByName.js
import { prisma } from '../server/prisma.js'

// Deletes a single cToon and all its dependent records
async function deleteCtoonAndDependencies(ctoonId) {
  await prisma.$transaction(async tx => {
    // 1) Claim-code prerequisites
    await tx.claimCodePrerequisite.deleteMany({ where: { ctoonId } })

    // 2) RewardCtoons & PackCtoonOptions
    await tx.rewardCtoon.deleteMany({ where: { ctoonId } })
    await tx.packCtoonOption.deleteMany({ where: { ctoonId } })

    // 3) Wishlist items
    await tx.wishlistItem.deleteMany({ where: { ctoonId } })

    // 4) Win Wheel options pointing at this cToon
    await tx.winWheelOption.deleteMany({ where: { ctoonId } })

    // 5) Starter set items that reference this cToon
    await tx.starterSetItem.deleteMany({ where: { ctoonId } })

    // 6) Clash deck cards that reference this cToon
    await tx.clashDeckCard.deleteMany({ where: { ctoonId } })

    // 7) Wheel spin logs: keep logs but null out the FK before delete
    await tx.wheelSpinLog.updateMany({
      where: { ctoonId },
      data: { ctoonId: null }
    })

    // 8) All UserCtoons for this Ctoon (and dependents)
    const userCtoons = await tx.userCtoon.findMany({
      where: { ctoonId },
      select: { id: true }
    })
    const ucIds = userCtoons.map(u => u.id)

    if (ucIds.length) {
      // 8a) Trade-offer items
      await tx.tradeOfferCtoon.deleteMany({ where: { userCtoonId: { in: ucIds } } })

      // 8b) TradeCtoons
      await tx.tradeCtoon.deleteMany({ where: { userCtoonId: { in: ucIds } } })

      // 8c) Auctions (and bids / auto-bids) tied to those UserCtoons
      const auctions = await tx.auction.findMany({
        where: { userCtoonId: { in: ucIds } },
        select: { id: true }
      })
      const aucIds = auctions.map(a => a.id)
      if (aucIds.length) {
        await tx.bid.deleteMany({ where: { auctionId: { in: aucIds } } })
        await tx.auctionAutoBid.deleteMany({ where: { auctionId: { in: aucIds } } })
        await tx.auction.deleteMany({ where: { id: { in: aucIds } } })
      }

      // 8d) Finally delete UserCtoons
      await tx.userCtoon.deleteMany({ where: { id: { in: ucIds } } })
    }

    // 9) Any GameConfig entries pointing to this as grand prize
    await tx.gameConfig.deleteMany({ where: { grandPrizeCtoonId: ctoonId } })

    // 10) And now the Ctoon itself
    await tx.ctoon.delete({ where: { id: ctoonId } })
  })
}

async function main() {
  try {
    // Find all cToons whose set is "Zoids" (case-insensitive)
    const toDelete = await prisma.ctoon.findMany({
      where: { set: { equals: 'Zoids Originals', mode: 'insensitive' } },
      select: { id: true, name: true, set: true }
    })

    if (toDelete.length === 0) {
      console.log('No cToons found with set = "Zoids Originals".')
      return
    }

    console.log(`Found ${toDelete.length} cToon(s) with set = "Zoids".`)
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
