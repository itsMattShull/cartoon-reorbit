import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  try {
    console.log('Starting database reset (preserving User and Points tables)...')

    // --- Delete in FK-safe order ---
    await prisma.tradeCtoon.deleteMany()
    await prisma.tradeSpectator.deleteMany()
    await prisma.trade.deleteMany()
    await prisma.tradeRoom.deleteMany()

    await prisma.rewardCtoon.deleteMany()
    await prisma.rewardPack.deleteMany()
    await prisma.claimCodeReward.deleteMany()

    await prisma.claim.deleteMany()
    await prisma.claimCode.deleteMany()

    await prisma.visit.deleteMany()
    await prisma.friend.deleteMany()
    await prisma.userCtoon.deleteMany()
    await prisma.cZone.deleteMany()

    await prisma.packCtoonOption.deleteMany()
    await prisma.packRarityConfig.deleteMany()
    await prisma.userPack.deleteMany()
    await prisma.pack.deleteMany()

    await prisma.ctoon.deleteMany()
    await prisma.userIP.deleteMany()

    console.log('Database reset complete. User and Points data remain intact.')
  } catch (err) {
    console.error('Error during reset:', err)
  } finally {
    await prisma.$disconnect()
  }
}

resetDatabase()
