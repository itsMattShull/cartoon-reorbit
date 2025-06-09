// server/utils/nuke.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  try {
    console.log('Starting database reset (deleting all tables except Ctoon)...')

    // --- Delete in FK-safe order (exclude Ctoon) ---
    await prisma.tradeCtoon.deleteMany()
    await prisma.tradeSpectator.deleteMany()
    await prisma.trade.deleteMany()
    await prisma.tradeRoom.deleteMany()

    await prisma.gameConfig.deleteMany()
    await prisma.gamePointLog.deleteMany()
    await prisma.loginLog.deleteMany()
    await prisma.visit.deleteMany()
    await prisma.friend.deleteMany()
    await prisma.userIP.deleteMany()

    await prisma.userCtoon.deleteMany()
    // await prisma.ctoon.deleteMany()  // intentionally commented out

    await prisma.packCtoonOption.deleteMany()
    await prisma.packRarityConfig.deleteMany()
    await prisma.rewardCtoon.deleteMany()
    await prisma.rewardPack.deleteMany()
    await prisma.claimCodeReward.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.claimCode.deleteMany()
    await prisma.userPack.deleteMany()
    await prisma.pack.deleteMany()

    await prisma.userPoints.deleteMany()
    await prisma.user.deleteMany()
    await prisma.cZone.deleteMany()

    console.log('Database reset complete. Ctoon rows preserved.')
  } catch (err) {
    console.error('Error during reset:', err)
  } finally {
    await prisma.$disconnect()
  }
}

resetDatabase()