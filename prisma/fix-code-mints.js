import { PrismaClient } from '@prisma/client'
import { mintQueue } from '../server/utils/queues.js'

const prisma = new PrismaClient()

async function main() {
  const mintedRecords = []

  // 1. Fetch all user claims with associated code rewards and cToons
  const claims = await prisma.claim.findMany({
    include: {
      user: { select: { id: true, username: true } },
      code: {
        include: {
          rewards: {
            include: {
              ctoons: true  // each has ctoonId and quantity
            }
          }
        }
      }
    }
  })

  // 2. Iterate over each claim
  for (const claim of claims) {
    const { user, code } = claim
    for (const reward of code.rewards) {
      for (const rc of reward.ctoons) {
        const ctoonId = rc.ctoonId
        // Check if user already owns this cToon
        const owns = await prisma.userCtoon.findFirst({
          where: {
            userId: user.id,
            ctoonId
          }
        })
        if (!owns) {
          // Enqueue mint job
          await mintQueue.add('mintCtoon', { userId: user.id, ctoonId, isSpecial: true })
          mintedRecords.push({ userId: user.id, username: user.username, ctoonId })
        }
      }
    }
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {})
