// server/api/cmoon/status.get.js
// The logged-in user's cMoon selection state: what they're in (if anything),
// whether they're still eligible to choose, and their personal deadline.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig, computeCMoonDeadline } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      cMoonId: true,
      cMoonSelectedAt: true,
      cMoonAutoAssigned: true,
      cMoonJoinEffectShown: true,
      cMoon: { select: { id: true, name: true, color: true } },
    },
  })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  // Independent of the feature flag below: a user who was already assigned a
  // cMoon (live or auto) still needs their one-time join effect even if an
  // admin later turns off new selections/auto-assignment.
  const pendingJoinEffect = !!user.cMoonId && !user.cMoonJoinEffectShown

  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { cMoonEnabled: false, pendingJoinEffect }

  const deadline = computeCMoonDeadline(user, config)

  return {
    cMoonEnabled: true,
    cMoon: user.cMoon,
    cMoonSelectedAt: user.cMoonSelectedAt,
    cMoonAutoAssigned: user.cMoonAutoAssigned,
    canChoose: !user.cMoonId && (!deadline || new Date() <= deadline),
    deadline,
    pendingJoinEffect,
  }
})
