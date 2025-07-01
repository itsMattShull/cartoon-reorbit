// unlockUserCtoons.js
import { PrismaClient, AuctionStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const result = await prisma.userCtoon.updateMany({
    where: {
      // only those with NO active auctions
      auctions: {
        none: {
          status: AuctionStatus.ACTIVE
        }
      }
    },
    data: {
      isTradeable: true
    }
  })

  console.log(`Updated ${result.count} UserCtoon records to isTradeable=true`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
