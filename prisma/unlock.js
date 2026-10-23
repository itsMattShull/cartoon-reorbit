// unlockUserCtoons.js
import { PrismaClient, AuctionStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

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
  .finally(async () => {})
