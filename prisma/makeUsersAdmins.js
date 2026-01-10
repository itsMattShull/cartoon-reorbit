import 'dotenv/config'
import { prisma } from '../server/prisma.js'

const GRANT_POINTS = 50_000
const BATCH_SIZE   = 100

async function grantPointsToAllUsers() {
  const users = await prisma.user.findMany({ select: { id: true } })
  let processed = 0

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(u =>
        prisma.userPoints.upsert({
          where:  { userId: u.id },
          update: { points: { increment: GRANT_POINTS } },
          create: { userId: u.id, points: GRANT_POINTS }
        })
      )
    )
    processed += batch.length
    console.log(`Granted ${GRANT_POINTS.toLocaleString()} points to ${processed}/${users.length} users`)
  }
}

async function main() {
  console.log('Making all users admins (isAdmin=true)…')
  const res = await prisma.user.updateMany({ data: { isAdmin: true } })
  console.log(`Updated ${res.count} users to isAdmin=true`)

  console.log(`Granting ${GRANT_POINTS.toLocaleString()} points to all users…`)
  await grantPointsToAllUsers()

  console.log('✅ Completed admin promotion and point grants.')
}

main()
  .catch(e => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {})
