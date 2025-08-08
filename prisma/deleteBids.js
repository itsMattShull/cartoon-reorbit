// server/scripts/delete-orphan-bids.js
import { prisma } from '../server/prisma.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Find bids whose auctionId no longer exists in Auction
  const orphanRows = await prisma.$queryRaw`
    SELECT b.id::text
    FROM "Bid" b
    LEFT JOIN "Auction" a ON a.id = b."auctionId"
    WHERE a.id IS NULL
  `;

  const orphanIds = orphanRows.map(r => r.id);

  if (orphanIds.length === 0) {
    console.log('No orphan Bid records found. ✅');
    return;
  }

  console.log(
    `${orphanIds.length} orphan Bid record(s) found${dryRun ? ' (dry-run)' : ''}.`
  );

  if (dryRun) {
    console.log('Would delete the following Bid IDs:', orphanIds);
    return;
  }

  // Delete in batches to avoid parameter limits
  const BATCH_SIZE = 500;
  let totalDeleted = 0;

  for (let i = 0; i < orphanIds.length; i += BATCH_SIZE) {
    const batch = orphanIds.slice(i, i + BATCH_SIZE);

    const result = await prisma.bid.deleteMany({
      where: { id: { in: batch } }
    });

    totalDeleted += result.count;
    console.log(`Deleted ${result.count} Bid(s) in this batch…`);
  }

  console.log(`✅ Done. Deleted ${totalDeleted} orphan Bid record(s).`);
}

main()
  .catch((err) => {
    console.error('Error deleting orphan bids:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
