import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    // 1. Find the cToon by name
    const ctoon = await prisma.ctoon.findFirst({
      where: { id: "7defae35-c41f-4cd7-ab2d-e54abe04fe65" },
      select: { id: true, name: true }
    })

    if (!ctoon) {
      console.log("No cToon found with name 'Father's Hug'. Nothing to delete.")
      return
    }

    // 2. Delete the cToon (will cascade or error if relations exist)
    await prisma.ctoon.delete({
      where: { id: ctoon.id }
    })

    console.log(`Successfully deleted cToon: "${ctoon.name}" (ID: ${ctoon.id})`)
  } catch (error) {
    console.error('Error deleting cToon:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
