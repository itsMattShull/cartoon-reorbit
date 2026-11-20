// Unfollow — see the sibling .post.js for what following subscribes you to. deleteMany rather
// than delete: idempotent, so unfollowing someone you don't currently follow (a stale UI, a
// double-click) is a no-op success rather than a 404 the client has to special-case.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const targetUserId = event.context.params?.userId
  if (!targetUserId || typeof targetUserId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'A target userId is required' })
  }

  await db.myOrbitFollow.deleteMany({ where: { followerId: userId, followedId: targetUserId } })
  return { success: true, following: false }
})
