// Follow a player's MyOrbit presence — see server/utils/notifications.js's
// notifyFollowedUserOnline for what this subscribes you to (an alert the next time they come
// online). Deliberately its own model (MyOrbitFollow), not the pre-existing Friend model — see
// that model's own schema comment for why. Idempotent: following someone you already follow is a
// no-op success, not a 409, since the client just toggles a single follow/unfollow button.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const targetUserId = event.context.params?.userId
  if (!targetUserId || typeof targetUserId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'A target userId is required' })
  }
  if (targetUserId === userId) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot follow yourself' })
  }

  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true, username: true } })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  await db.myOrbitFollow.upsert({
    where: { followerId_followedId: { followerId: userId, followedId: targetUserId } },
    create: { followerId: userId, followedId: targetUserId },
    update: {}
  })

  return { success: true, following: true, username: target.username }
})
