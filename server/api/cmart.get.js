import { prisma } from '@/server/prisma'

export default defineEventHandler(async () => {
  const now = new Date()
  const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const ctoons = await prisma.ctoon.findMany({
    where: {
      inCmart: true,
      releaseDate: { lte: twoWeeksAhead }
    },
    orderBy: { releaseDate: 'desc' }
  })

  return ctoons
})