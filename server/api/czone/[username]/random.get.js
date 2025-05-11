import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // Count how many users qualify
  const total = await prisma.user.count({
    where: {
      username: { not: null, notIn: [''] }
    }
  })

  if (total === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No valid users found'
    })
  }

  // Pick a random offset
  const randomOffset = Math.floor(Math.random() * total)

  // Fetch one user at that offset
  const randomUser = await prisma.user.findFirst({
    where: {
      username: { not: null, notIn: [''] }
    },
    skip: randomOffset,
    select: { username: true }
  })

  if (!randomUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Random user not found'
    })
  }

  return { username: randomUser.username }
})