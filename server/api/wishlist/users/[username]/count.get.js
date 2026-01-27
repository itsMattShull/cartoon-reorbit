// server/api/wishlist/users/[username]/count.get.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const requesterId = event.context.userId
  if (!requesterId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const username = event.context.params?.username
  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Missing username' })
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { _count: { select: { wishlistItems: true } } }
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return { count: user._count.wishlistItems }
})
