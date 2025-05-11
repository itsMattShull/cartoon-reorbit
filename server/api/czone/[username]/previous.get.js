import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const { username } = event.context.params

  // 1. Find the current user
  const currentUser = await prisma.user.findUnique({
    where: { username },
    select: { createdAt: true }
  })

  if (!currentUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  // 2. Find the previous user based on createdAt
  const previousUser = await prisma.user.findFirst({
    where: {
      createdAt: { lt: currentUser.createdAt },
      username: { not: null, notIn: [''] }
    },
    orderBy: { createdAt: 'desc' },
    select: { username: true }
  })

  if (!previousUser) {
    // Get the most recently created user (wrap around)
    const latestUser = await prisma.user.findFirst({
      where: {
        username: { not: null, notIn: [''] }
      },
      orderBy: { createdAt: 'desc' },
      select: { username: true }
    })

    if (!latestUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No users in database'
      })
    }

    return { username: latestUser.username }
  }

  // 3. Return the username
  return { username: previousUser.username }
})