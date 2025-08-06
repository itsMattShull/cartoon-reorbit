// server/scripts/close-auctions.js
import { prisma } from '../server/prisma.js';

async function main() {
  const now = new Date();
  const auctionIds = [
    '799f4c48-a08d-4acc-88c3-a635935def96',
    '4e65989a-ec19-4fef-a7dc-0101cf7c5115',
    '47384702-497b-4447-ba69-dcafff189894',
    'f01a70ff-e023-4395-83ac-1925ccf83799'
  ];

  await prisma.$transaction(async (tx) => {
    for (const id of auctionIds) {
      // fetch the auction and its bids
      const auction = await tx.auction.findUnique({
        where: { id },
        include: { bids: true }
      });

      if (!auction) {
        console.log(`No auction found with ID ${id}`);
        continue;
      }

      // determine the highest bid, if any
      const winningBid = auction.bids
        .sort((a, b) => b.amount - a.amount)[0];

      // close the auction
      await tx.auction.update({
        where: { id },
        data: {
          status: 'CLOSED',
          winnerId: winningBid?.userId || null,
          highestBidderId: winningBid?.userId || null,
          winnerAt: now,
          ...(winningBid && { highestBid: winningBid.amount })
        }
      });

      // mark the associated UserCtoon as tradeable
      await tx.userCtoon.update({
        where: { id: auction.userCtoonId },
        data: { isTradeable: true }
      });

      console.log(`Closed auction ${id} and set UserCtoon ${auction.userCtoonId} as tradeable.`);
    }
  });

  console.log('✅ All specified auctions closed and tradeable flags updated.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
