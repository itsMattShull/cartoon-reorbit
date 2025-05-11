import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
    const userId = event.context.userId
    if (!userId) {
      throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
    }
  
    const { username } = await readBody(event)
    if (!username || typeof username !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid username' })
    }
  
    const targetUser = await prisma.user.findUnique({
      where: { username }
    })
  
    if (!targetUser) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }
  
    if (targetUser.id === userId) {
      throw createError({ statusCode: 400, statusMessage: 'You cannot friend yourself' })
    }
  
    const alreadyFriends = await prisma.friend.findUnique({
      where: {
        userId_friendId: {
          userId,
          friendId: targetUser.id
        }
      }
    })
  
    if (alreadyFriends) {
      throw createError({ statusCode: 409, statusMessage: 'Already added as friend' })
    }
  
    await prisma.friend.create({
      data: {
        userId,
        friendId: targetUser.id
      }
    })
  
    return { success: true, message: `You added ${username} as a friend.` }
  })
  