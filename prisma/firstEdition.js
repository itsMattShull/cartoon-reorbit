// scripts/updateFirstEditions.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. Load every UserCtoon with its mintNumber and the parent Ctoon's initialQuantity
  const all = await prisma.userCtoon.findMany({
    select: {
      id: true,
      mintNumber: true,
      ctoon: {
        select: {
          initialQuantity: true
        }
      }
    }
  })

  // 2. Loop and update only those that should be first-edition
  let updatedCount = 0
  for (const { id, mintNumber, ctoon: { initialQuantity } } of all) {
    const shouldBeFirst =
      initialQuantity === null ||
      (mintNumber != null && mintNumber <= initialQuantity)

    if (shouldBeFirst) {
      await prisma.userCtoon.update({
        where: { id },
        data: { isFirstEdition: true }
      })
      updatedCount++
    }
  }

  console.log(`✅ Updated ${updatedCount} of ${all.length} UserCtoon rows to first edition.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {
    prisma.$disconnect()
  })
