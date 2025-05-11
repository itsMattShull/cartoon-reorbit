import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()

  const updates = users.map(user =>
    prisma.userPoints.upsert({
      where: { userId: user.id },
      update: { points: { increment: 2000 } },
      create: {
        userId: user.id,
        points: 2000
      }
    })
  )

  await Promise.all(updates)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
