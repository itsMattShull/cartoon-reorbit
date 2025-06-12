import { prisma } from '@/server/prisma'
export default defineEventHandler(async (event) => {
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
