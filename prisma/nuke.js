import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  try {
    console.log('Starting full database reset...')

    // Order matters due to foreign key constraints
    await prisma.tradeCtoon.deleteMany()
    await prisma.trade.deleteMany()
    await prisma.tradeSpectator.deleteMany()
    await prisma.tradeRoom.deleteMany()
    await prisma.claimCodeReward.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.claimCode.deleteMany()
    await prisma.visit.deleteMany()
    await prisma.friend.deleteMany()
    await prisma.userCtoon.deleteMany()
    await prisma.cZone.deleteMany()
    await prisma.ctoon.deleteMany()
    await prisma.userIP.deleteMany()
    await prisma.userPoints.deleteMany()
    await prisma.user.deleteMany()

    console.log('Full reset complete.')
  } catch (err) {
    console.error('Error during reset:', err)
  } finally {
    await prisma.$disconnect()
  }
}

resetDatabase()