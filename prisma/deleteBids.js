// server/scripts/delete-orphan-bids.js
import { prisma } from '../server/prisma.js';

async function main() {
  console.log('🔍 Finding orphaned bids...');

  // Find bids where auctionId does not match any Auction.id
  const orphanBids = await prisma.bid.findMany({
    where: {
      auction: null // relation filter: means no auction exists for this bid
    },
    select: { id: true }
  });

  if (orphanBids.length === 0) {
    console.log('✅ No orphan bids found.');
    return;
  }

  console.log(`Found ${orphanBids.length} orphan bids. Deleting...`);

  const deleted = await prisma.bid.deleteMany({
    where: {
      id: { in: orphanBids.map(b => b.id) }
    }
  });

  console.log(`🗑 Deleted ${deleted.count} orphan bids.`);
}

main()
  .catch(err => {
    console.error('❌ Error deleting orphan bids:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
