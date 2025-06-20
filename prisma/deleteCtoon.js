import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const ctoonId = '7defae35-c41f-4cd7-ab2d-e54abe04fe65'
  try {
    // 1. Verify Ctoon exists
    const ctoon = await prisma.ctoon.findUnique({ where: { id: ctoonId } })
    if (!ctoon) {
      console.log(`No cToon found with ID ${ctoonId}. Nothing to delete.`)
      return
    }

    // 2. Remove related records
    await prisma.$transaction([
      prisma.userCtoon.deleteMany({ where: { ctoonId } }),
      prisma.rewardCtoon.deleteMany({ where: { ctoonId } }),
      prisma.packCtoonOption.deleteMany({ where: { ctoonId } }),
      prisma.wishlistItem.deleteMany({ where: { ctoonId } }),
      prisma.gameConfig.updateMany({
        where: { grandPrizeCtoonId: ctoonId },
        data: { grandPrizeCtoonId: null }
      }),
      // add more deletions here if other relations exist
    ])

    // 3. Delete the Ctoon itself
    await prisma.ctoon.delete({ where: { id: ctoonId } })

    console.log(`Successfully deleted cToon and related records for ID ${ctoonId}`)
  } catch (error) {
    console.error('Error deleting cToon:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
