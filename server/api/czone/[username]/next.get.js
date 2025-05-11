import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const { username } = event.context.params

  // 1. Find current user
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

  // 2. Find next user by createdAt
  const nextUser = await prisma.user.findFirst({
    where: {
      createdAt: { gt: currentUser.createdAt },
      username: { not: null, notIn: [''] }
    },
    orderBy: { createdAt: 'asc' },
    select: { username: true }
  })

  if (nextUser) {
    return { username: nextUser.username }
  }

  // 3. Wrap around to earliest user if no next one
  const firstUser = await prisma.user.findFirst({
    where: {
      username: { not: null, notIn: [''] }
    },
    orderBy: { createdAt: 'asc' },
    select: { username: true }
  })

  if (!firstUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No users found'
    })
  }

  return { username: firstUser.username }
})