import { prisma } from '@/server/prisma'

async function main() {
  // 1) Look up that one user by username
  const user = await prisma.user.findUnique({
    where: { username: 'CartoonReOrbitOfficial' },
    select: { id: true }
  })

  if (!user) {
    console.error('User "CartoonReOrbitOfficial" not found.')
    process.exit(1)
  }

  // 2) Upsert their points to +1_000_000_000
  await prisma.userPoints.upsert({
    where: { userId: user.id },
    update: { points: { increment: 1_000_000_000 } },
    create: {
      userId: user.id,
      points: 1_000_000_000
    }
  })

  console.log('Awarded 1 000 000 000 points to CartoonReOrbitOfficial.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
