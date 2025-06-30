// deleteCtoon.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteCtoonAndDependencies(ctoonId) {
  await prisma.$transaction(async tx => {
    // 1. Claim-code prerequisites
    await tx.claimCodePrerequisite.deleteMany({
      where: { ctoonId }
    });

    // 2. RewardCtoons & PackCtoonOptions
    await tx.rewardCtoon.deleteMany({ where: { ctoonId } });
    await tx.packCtoonOption.deleteMany({ where: { ctoonId } });

    // 3. Wishlist items
    await tx.wishlistItem.deleteMany({ where: { ctoonId } });

    // 4. All UserCtoons for this Ctoon
    const userCtoons = await tx.userCtoon.findMany({
      where: { ctoonId },
      select: { id: true }
    });
    const ucIds = userCtoons.map(u => u.id);

    if (ucIds.length) {
      // 4a. Trade-offer items
      await tx.tradeOfferCtoon.deleteMany({
        where: { userCtoonId: { in: ucIds } }
      });
      // 4b. TradeCtoons
      await tx.tradeCtoon.deleteMany({
        where: { userCtoonId: { in: ucIds } }
      });
      // 4c. Auctions and their bids
      const auctions = await tx.auction.findMany({
        where: { userCtoonId: { in: ucIds } },
        select: { id: true }
      });
      const aucIds = auctions.map(a => a.id);
      if (aucIds.length) {
        await tx.bid.deleteMany({ where: { auctionId: { in: aucIds } } });
        await tx.auction.deleteMany({ where: { id: { in: aucIds } } });
      }
      // 4d. Finally delete UserCtoons
      await tx.userCtoon.deleteMany({ where: { id: { in: ucIds } } });
    }

    // 5. Any GameConfig entries pointing to this as grand prize
    await tx.gameConfig.deleteMany({
      where: { grandPrizeCtoonId: ctoonId }
    });

    // 6. And now the Ctoon itself
    await tx.ctoon.delete({
      where: { id: ctoonId }
    });
  });
}

(async () => {
  const ctoonId = '488b7a36-d34f-4695-9a91-dff8635a05be';
  try {
    await deleteCtoonAndDependencies(ctoonId);
    console.log(`Successfully deleted Ctoon ${ctoonId} and all its dependencies.`);
  } catch (e) {
    console.error('Error deleting Ctoon:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
