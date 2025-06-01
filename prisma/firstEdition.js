// scripts/updateFirstEditions.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. Load every UserCtoon with its current isFirstEdition, mintNumber, and parent initialQuantity
  const all = await prisma.userCtoon.findMany({
    select: {
      id: true,
      mintNumber: true,
      isFirstEdition: true,
      ctoon: {
        select: {
          initialQuantity: true
        }
      }
    }
  })

  // 2. Loop and update mismatches
  let updatedCount = 0
  for (const { id, mintNumber, isFirstEdition, ctoon: { initialQuantity } } of all) {
    const desiredIsFirst =
      initialQuantity !== null &&
      mintNumber != null &&
      mintNumber <= initialQuantity

    // If the stored flag doesn’t match what we want, flip it
    if (isFirstEdition !== desiredIsFirst) {
      await prisma.userCtoon.update({
        where: { id },
        data: { isFirstEdition: desiredIsFirst }
      })
      updatedCount++
    }
  }
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {
    prisma.$disconnect()
  })
