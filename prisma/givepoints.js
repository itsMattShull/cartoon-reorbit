// scripts/grant-all-users-1000.js
import { prisma } from '../server/prisma.js'

const GRANT_AMOUNT = 1_000
const BATCH_SIZE   = 100 // adjust if you have lots of users

async function grantToUser(user) {
  const updated = await prisma.userPoints.upsert({
    where:  { userId: user.id },
    update: { points: { increment: GRANT_AMOUNT } },
    create: { userId: user.id, points: GRANT_AMOUNT }
  })

  // Optional: keep an audit trail (comment out if you don't use pointsLog)
  try {
    await prisma.pointsLog.create({
      data: {
        userId: user.id,
        points: GRANT_AMOUNT,
        total:  updated.points,
        method: 'Admin grant: all users',
        direction: 'increase'
      }
    })
  } catch (e) {
    // If you don't have pointsLog, ignore; otherwise, surface the error
    if (e?.code !== 'P2021') { // unknown table
      console.warn(`pointsLog write failed for ${user.username}:`, e)
    }
  }

  console.log(
    `Awarded ${GRANT_AMOUNT.toLocaleString()} points to ${user.username}. ` +
    `New total: ${updated.points.toLocaleString()}.`
  )
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
    orderBy: { id: 'asc' }
  })

  console.log(`Granting ${GRANT_AMOUNT} points to ${users.length} users...`)

  // Process in small batches to avoid hammering the DB
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(grantToUser))
    console.log(`Processed ${Math.min(i + BATCH_SIZE, users.length)} / ${users.length}`)
  }

  console.log('Done.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
