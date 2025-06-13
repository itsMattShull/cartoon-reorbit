// server/api/wishlist/users/[username].get.js
import { PrismaClient }      from '@prisma/client'
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const username = event.context.params.username
  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Missing username' })
  }

  const userWithWishlist = await prisma.user.findUnique({
    where: { username },
    select: {
      wishlistItems: {
        include: { ctoon: true }
      }
    }
  })
  if (!userWithWishlist) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // return just the cToon objects
  return userWithWishlist.wishlistItems.map((wi) => wi.ctoon)
})
