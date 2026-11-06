// server/api/cmoon/prestige-status.get.js
// The logged-in user's own cMoon Prestige eligibility — whether the feature is on, their current
// level, what the next one needs, and (only once actually eligible) the list of cMoons they could
// prestige into. Always scoped to event.context.userId, same as every other cMoon self-service
// endpoint — never accepts a client-supplied userId.
import { defineEventHandler, createError } from 'h3'
import { getPrestigeStatus, CMoonPrestigeError } from '@/server/utils/cmoonPrestige'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  try {
    return await getPrestigeStatus(userId)
  } catch (err) {
    if (err instanceof CMoonPrestigeError) throw createError({ statusCode: 404, statusMessage: 'Unable to load prestige status' })
    throw createError({ statusCode: 500, statusMessage: 'Unable to load prestige status' })
  }
})
