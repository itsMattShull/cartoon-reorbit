import { PrismaClient } from '@prisma/client'
export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()

  const ctoons = await prisma.ctoon.findMany({
    where: {
      inCmart: true,
      releaseDate: {
        lte: new Date()
      }
    },
    include: {
      owners: true
    },
    orderBy: {
      releaseDate: 'desc'
    }
  })

  return ctoons
})
