// server/api/wishlist/users/[username].get.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const username = event.context.params?.username
  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Missing username' })
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      points: { select: { points: true } }, // UserPoints relation
      wishlistItems: {
        select: {
          id: true,
          offeredPoints: true,
          createdAt: true,
          ctoon: true
        }
      }
    }
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const available = user.points?.points ?? 0

  return user.wishlistItems.map(({ id, offeredPoints, createdAt, ctoon }) => ({
    id,
    offeredPoints,
    createdAt,
    hasEnough: available >= offeredPoints,
    ctoon
  }))
})
