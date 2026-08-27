// server/api/cmoon/status.get.js
// The logged-in user's cMoon selection state: what they're in (if anything), and whether the
// join modal should pop up automatically (canChoose). There is no deadline/auto-assignment —
// a user who explicitly opted out just stops seeing the automatic prompt (see cMoonOptedOut);
// they can still join later via the "Join a cMoon" button on /newsite/cmoon-nav, which reopens
// the same modal regardless of canChoose.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { cMoonEnabled: false }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      cMoonId: true,
      cMoonSelectedAt: true,
      cMoonAutoAssigned: true,
      cMoonOptedOut: true,
      cMoon: { select: { id: true, name: true, color: true } },
    },
  })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  return {
    cMoonEnabled: true,
    cMoon: user.cMoon,
    cMoonSelectedAt: user.cMoonSelectedAt,
    cMoonAutoAssigned: user.cMoonAutoAssigned,
    cMoonOptedOut: user.cMoonOptedOut,
    canChoose: !user.cMoonId && !user.cMoonOptedOut,
  }
})
