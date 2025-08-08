import { prisma } from '../server/prisma.js'

const AWARDS = {
  'BraveCheetahAthlete': 10_000,
  'SuperSharkSlayer': 100_000
}

async function awardPointsToUsername(username, amount) {
  // Case-insensitive just to be safe; remove mode if you want strict match
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true, username: true }
  })

  if (!user) {
    console.warn(`User "${username}" not found. Skipping.`)
    return
  }

  const updated = await prisma.userPoints.upsert({
    where: { userId: user.id },
    update: { points: { increment: amount } },
    create: { userId: user.id, points: amount }
  })

  console.log(
    `Awarded ${amount.toLocaleString()} points to ${user.username}. New total: ${updated.points.toLocaleString()}.`
  )
}

async function main() {
  for (const [username, amount] of Object.entries(AWARDS)) {
    await awardPointsToUsername(username, amount)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
