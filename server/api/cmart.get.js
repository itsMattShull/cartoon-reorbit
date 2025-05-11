export default defineEventHandler(async (event) => {
  const prisma = event.context.prisma

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
