// server/api/cmoon/select.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { selectCMoonForUser, CMoonError, CMOON_SELECT_ERRORS } from '@/server/utils/cmoon'

const ERROR_STATUS = {
  [CMOON_SELECT_ERRORS.DISABLED]: { statusCode: 403, statusMessage: 'cMoons are not currently enabled' },
  [CMOON_SELECT_ERRORS.NOT_FOUND]: { statusCode: 404, statusMessage: 'cMoon not found' },
  [CMOON_SELECT_ERRORS.ALREADY_ASSIGNED]: { statusCode: 409, statusMessage: 'You already belong to a cMoon' },
  [CMOON_SELECT_ERRORS.DEADLINE_PASSED]: { statusCode: 409, statusMessage: 'Your selection window has passed' },
  [CMOON_SELECT_ERRORS.LOCKED]: { statusCode: 403, statusMessage: 'This cMoon is locked and cannot be joined directly' },
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const cMoonId = typeof body?.cMoonId === 'string' ? body.cMoonId : ''
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'cMoonId is required' })

  try {
    const assigned = await selectCMoonForUser(userId, cMoonId)
    return { ok: true, cMoonId: assigned }
  } catch (err) {
    if (err instanceof CMoonError) {
      const mapped = ERROR_STATUS[err.code] || { statusCode: 400, statusMessage: 'Unable to select cMoon' }
      throw createError(mapped)
    }
    throw createError({ statusCode: 500, statusMessage: 'Unable to select cMoon' })
  }
})
