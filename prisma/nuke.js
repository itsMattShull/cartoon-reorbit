// server/scripts/nuke.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  try {
    console.log('Starting database reset (deleting all tables except Ctoon)…')

    // 1) Drop trading tables
    await prisma.tradeCtoon.deleteMany()
    await prisma.tradeSpectator.deleteMany()
    await prisma.trade.deleteMany()
    await prisma.tradeRoom.deleteMany()

    // 2) Drop reward & claim tables
    await prisma.rewardCtoon.deleteMany()
    await prisma.rewardPack.deleteMany()
    await prisma.claimCodeReward.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.claimCode.deleteMany()

    // 3) Drop game & activity logs
    await prisma.gamePointLog.deleteMany()
    await prisma.loginLog.deleteMany()
    await prisma.visit.deleteMany()
    await prisma.friend.deleteMany()

    // 4) Drop all user-owned assets
    await prisma.userCtoon.deleteMany()
    await prisma.packCtoonOption.deleteMany()
    await prisma.packRarityConfig.deleteMany()
    await prisma.userPack.deleteMany()
    await prisma.pack.deleteMany()
    await prisma.userIP.deleteMany()

    // 5) **CRITICAL**: drop CZone before users to avoid FK errors
    await prisma.cZone.deleteMany()

    // 6) Finally, drop users & their points
    await prisma.userPoints.deleteMany()
    await prisma.user.deleteMany()

    // 7) (Intentionally commented out) preserve the Ctoon table
    // await prisma.ctoon.deleteMany()

    console.log('✅ Database reset complete. All tables except Ctoon have been cleared.')
  } catch (err) {
    console.error('❌ Error during reset:', err)
  } finally {
    await prisma.$disconnect()
  }
}

resetDatabase()
