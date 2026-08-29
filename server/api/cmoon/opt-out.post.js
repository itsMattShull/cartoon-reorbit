// server/api/cmoon/opt-out.post.js
// Declines the "choose your cMoon" prompt without joining anything — see
// server/utils/cmoon.js's optOutOfCMoonSelection for the atomicity note.
import { defineEventHandler, createError } from 'h3'
import { optOutOfCMoonSelection, CMoonError, CMOON_SELECT_ERRORS } from '@/server/utils/cmoon'

const ERROR_STATUS = {
  [CMOON_SELECT_ERRORS.DISABLED]: { statusCode: 403, statusMessage: 'cMoons are not currently enabled' },
  [CMOON_SELECT_ERRORS.NOT_FOUND]: { statusCode: 404, statusMessage: 'User not found' },
  [CMOON_SELECT_ERRORS.ALREADY_ASSIGNED]: { statusCode: 409, statusMessage: 'You already belong to a cMoon' },
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  try {
    await optOutOfCMoonSelection(userId)
    return { ok: true }
  } catch (err) {
    if (err instanceof CMoonError) {
      const mapped = ERROR_STATUS[err.code] || { statusCode: 400, statusMessage: 'Unable to skip cMoon selection' }
      throw createError(mapped)
    }
    throw createError({ statusCode: 500, statusMessage: 'Unable to skip cMoon selection' })
  }
})
