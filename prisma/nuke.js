import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  try {
    console.log('Starting database reset (preserving User and Points tables)...')

    // Delete in dependency order to avoid FK violations
    await prisma.tradeCtoon.deleteMany()
    await prisma.tradeSpectator.deleteMany()
    await prisma.trade.deleteMany()
    await prisma.tradeRoom.deleteMany()

    // Remove RewardCtoon entries before deleting their parent ClaimCodeRewards
    await prisma.rewardCtoon.deleteMany()
    await prisma.claimCodeReward.deleteMany()

    // Remove claims tied to codes, then the codes themselves
    await prisma.claim.deleteMany()
    await prisma.claimCode.deleteMany()

    // Other relational tables
    await prisma.visit.deleteMany()
    await prisma.friend.deleteMany()
    await prisma.userCtoon.deleteMany()
    await prisma.cZone.deleteMany()
    await prisma.ctoon.deleteMany()
    await prisma.userIP.deleteMany()

    // Note: User and UserPoints tables are preserved
    console.log('Database reset complete. User and Points data remain intact.')
  } catch (err) {
    console.error('Error during reset:', err)
  } finally {
    await prisma.$disconnect()
  }
}

resetDatabase()
