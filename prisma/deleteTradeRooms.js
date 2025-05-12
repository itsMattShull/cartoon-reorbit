// scripts/cleanup-trade-records.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {

  // 1) Delete individual trade items (children of Trade)
  const deletedCtoons = await prisma.tradeCtoon.deleteMany({});

  // 2) Delete any spectator records (children of TradeRoom)
  const deletedSpectators = await prisma.tradeSpectator.deleteMany({});

  // 3) Delete the trades themselves
  const deletedTrades = await prisma.trade.deleteMany({});

  // 4) Finally, delete the trade rooms
  const deletedRooms = await prisma.tradeRoom.deleteMany({});
}

main()
  .catch(err => {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });