// server/api/cmoon/prestige.post.js
// Player-initiated cMoon Prestige — immediate, no admin approval (unlike change-request.post.js).
// Re-validates eligibility/target server-side regardless of what the client's own
// prestige-status.get.js call showed moments ago — see prestigeUser's own comment.
import { defineEventHandler, readBody, createError } from 'h3'
import { prestigeUser, CMoonPrestigeError, CMOON_PRESTIGE_ERRORS } from '@/server/utils/cmoonPrestige'
import { assertSameOrigin } from '@/server/utils/requireAdmin'

const ERROR_STATUS = {
  [CMOON_PRESTIGE_ERRORS.DISABLED]: { statusCode: 403, statusMessage: 'cMoon Prestige is not currently enabled' },
  [CMOON_PRESTIGE_ERRORS.NOT_FOUND]: { statusCode: 404, statusMessage: 'User not found' },
  [CMOON_PRESTIGE_ERRORS.NO_CMOON]: { statusCode: 400, statusMessage: 'You must be in a cMoon to prestige' },
  [CMOON_PRESTIGE_ERRORS.BELOW_THRESHOLD]: { statusCode: 403, statusMessage: "You haven't reached the point threshold to prestige yet" },
  [CMOON_PRESTIGE_ERRORS.NO_LEVEL_CONFIGURED]: { statusCode: 403, statusMessage: 'The next prestige level has not been configured yet' },
  [CMOON_PRESTIGE_ERRORS.TARGET_NOT_FOUND]: { statusCode: 404, statusMessage: 'That cMoon was not found' },
  [CMOON_PRESTIGE_ERRORS.NOT_PRESTIGE_CMOON]: { statusCode: 400, statusMessage: 'That cMoon is not a prestige cMoon' },
  [CMOON_PRESTIGE_ERRORS.LOCKED]: { statusCode: 403, statusMessage: 'That cMoon is locked and cannot be joined directly' },
  [CMOON_PRESTIGE_ERRORS.SAME_CMOON]: { statusCode: 409, statusMessage: 'You are already in that cMoon' },
  [CMOON_PRESTIGE_ERRORS.ACTIVE_BATTLE]: { statusCode: 409, statusMessage: 'Finish your current cMoon Enemy battle before prestiging' },
  [CMOON_PRESTIGE_ERRORS.ACTIVE_RAID]: { statusCode: 409, statusMessage: 'Finish your current raid before prestiging' },
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  assertSameOrigin(event)

  const body = await readBody(event)
  const cMoonId = typeof body?.cMoonId === 'string' ? body.cMoonId : ''
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'cMoonId is required' })

  try {
    const result = await prestigeUser(userId, cMoonId)
    return { ok: true, ...result }
  } catch (err) {
    if (err instanceof CMoonPrestigeError) {
      const mapped = ERROR_STATUS[err.code] || { statusCode: 400, statusMessage: 'Unable to prestige right now' }
      throw createError(mapped)
    }
    throw createError({ statusCode: 500, statusMessage: 'Unable to prestige right now' })
  }
})
