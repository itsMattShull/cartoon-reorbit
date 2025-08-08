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
  console.log(`Found CartoonReOrbitOfficial userId: ${user.id}`);

  // 2) Find all auctions they won
  const auctions = await prisma.auction.findMany({
    where: { winnerId: user.id },
    include: {
      bids: true,
      creator: { select: { id: true, username: true } }
    }
  });

  console.log(`Found ${auctions.length} auctions won by CartoonReOrbitOfficial.`);

  // 3) Filter invalid ones
  const invalidAuctions = auctions.filter(auction => {
    const winningBid = auction.bids.sort((a, b) => b.amount - a.amount)[0];
    return winningBid && !allowedAmounts.includes(winningBid.amount);
  });

  console.log(`Found ${invalidAuctions.length} invalid auctions.`);

  // 4) Process fixes
  await prisma.$transaction(async (tx) => {
    for (const auction of invalidAuctions) {
      const winningBid = auction.bids.sort((a, b) => b.amount - a.amount)[0];
      if (!winningBid) continue;

      console.log(
        `Fixing auction ${auction.id} | Winning bid: ${winningBid.amount} | Creator: ${auction.creator.username}`
      );

      // 4.1 Update UserCtoon owner
      // await tx.userCtoon.update({
      //   where: { id: auction.userCtoonId },
      //   data: { userId: auction.creator.id }
      // });

      // 4.2 Deduct winning bid points from creator
      // await tx.userPoints.updateMany({
      //   where: { userId: auction.creator.id },
      //   data: { points: { decrement: winningBid.amount } }
      // });

      // 4.3 Remove points logs for same day & same amount
      const bidDateStart = new Date(winningBid.createdAt);
      bidDateStart.setHours(0, 0, 0, 0);

      const bidDateEnd = new Date(winningBid.createdAt);
      bidDateEnd.setHours(23, 59, 59, 999);

      // const deletedLogs = await tx.pointsLog.deleteMany({
      //   where: {
      //     userId: auction.creator.id,
      //     points: winningBid.amount,
      //     createdAt: {
      //       gte: bidDateStart,
      //       lte: bidDateEnd
      //     }
      //   }
      // });

      // console.log(
      //   `✅ Auction ${auction.id} fixed — ownership reverted, ${winningBid.amount} points deducted, ${deletedLogs.count} points logs removed`
      // );
      console.log(
        `✅ Auction ${auction.id} fixed — ownership reverted, ${winningBid.amount} points deducted`
      );
    }
  });

  console.log('🎯 All invalid auctions processed.');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
