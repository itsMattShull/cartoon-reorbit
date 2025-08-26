// server/scripts/fix-cartoonreorbit-auctions.js
import { prisma } from '../server/prisma.js';

async function main() {
  const allowedAmounts = [25, 50, 100, 187, 312];

  // 1) Look up CartoonReOrbitOfficial userId
  const user = await prisma.user.findUnique({
    where: { username: 'CartoonReOrbitOfficial' },
    select: { id: true }
  });

  if (!user) {
    console.error('User "CartoonReOrbitOfficial" not found.');
    process.exit(1);
  }

  // 2) Find all auctions they won
  const auctions = await prisma.auction.findMany({
    where: { winnerId: user.id },
    include: {
      bids: true,
      creator: { select: { id: true, username: true } }
    }
  });

  // 3) Filter invalid ones
  const invalidAuctions = auctions.filter(auction => {
    const winningBid = auction.bids.sort((a, b) => b.amount - a.amount)[0];
    return winningBid && !allowedAmounts.includes(winningBid.amount);
  });

  // 4) Process fixes + delete auction & its bids
  await prisma.$transaction(async (tx) => {
    for (const auction of invalidAuctions) {
      const winningBid = auction.bids.sort((a, b) => b.amount - a.amount)[0];
      if (!winningBid) continue;

      // 4.1 Update UserCtoon owner (revert to creator)
      await tx.userCtoon.update({
        where: { id: auction.userCtoonId },
        data: { userId: auction.creator.id }
      });

      // 4.2 Deduct winning bid points from creator
      await tx.userPoints.updateMany({
        where: { userId: auction.creator.id },
        data: { points: { decrement: winningBid.amount } }
      });

      // 4.3 Remove points logs for same day & same amount (creator)
      const bidDateStart = new Date(winningBid.createdAt);
      bidDateStart.setHours(0, 0, 0, 0);

      const bidDateEnd = new Date(winningBid.createdAt);
      bidDateEnd.setHours(23, 59, 59, 999);

      const deletedLogs = await tx.pointsLog.deleteMany({
        where: {
          userId: auction.creator.id,
          points: winningBid.amount,
          createdAt: {
            gte: bidDateStart,
            lte: bidDateEnd
          }
        }
      });

      // 4.4 Delete all bids for this auction
      const deletedBids = await tx.bid.deleteMany({
        where: { auctionId: auction.id }
      });

      // 4.5 Delete the auction itself
      await tx.auction.delete({
        where: { id: auction.id }
      });

      console.log(
        `✅ Auction ${auction.id} fixed — ownership reverted, ${winningBid.amount} points deducted, ` +
        `${deletedBids.count} bid(s) deleted, auction deleted`
      );
    }
  });

  console.log('🎯 All invalid auctions processed and deleted.');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
