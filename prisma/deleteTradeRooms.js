// scripts/cleanup-trade-records.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting trade-related cleanup…');

  // 1) Delete individual trade items (children of Trade)
  const deletedCtoons = await prisma.tradeCtoon.deleteMany({});
  console.log(`Deleted ${deletedCtoons.count} TradeCtoon records`);

  // 2) Delete any spectator records (children of TradeRoom)
  const deletedSpectators = await prisma.tradeSpectator.deleteMany({});
  console.log(`Deleted ${deletedSpectators.count} TradeSpectator records`);

  // 3) Delete the trades themselves
  const deletedTrades = await prisma.trade.deleteMany({});
  console.log(`Deleted ${deletedTrades.count} Trade records`);

  // 4) Finally, delete the trade rooms
  const deletedRooms = await prisma.tradeRoom.deleteMany({});
  console.log(`Deleted ${deletedRooms.count} TradeRoom records`);

  console.log('✅ Cleanup complete.');
}

main()
  .catch(err => {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });