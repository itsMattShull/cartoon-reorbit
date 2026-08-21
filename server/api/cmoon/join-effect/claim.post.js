// server/api/cmoon/join-effect/claim.post.js
// Claims this user's pending cMoon join effect (if any), exactly once. Called
// right after a live selection succeeds, and on next visit for cron
// auto-assigned users who were offline when they were assigned.
import { defineEventHandler, createError } from 'h3'
import { claimPendingCMoonJoinEffect } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const effect = await claimPendingCMoonJoinEffect(userId)
  return effect ? { pending: true, effect } : { pending: false }
})
