// server/api/redeem.post.js
//
// A thin wrapper now — the actual redemption logic (including the "Handicap Redeems" hold/release
// branch for admin-flagged players, see server/utils/handicapRedeem.js) lives in
// server/utils/codeRedemption.js so it can also run outside an HTTP request, when a held
// redemption gets released by someone else's claim on the same code.
//
// Failed attempts are recorded (server/utils/redeemAttemptLog.js) for the admin Codes → "Failed
// Attempts" tab, then the original error is re-thrown unchanged.
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { redeemClaimCode } from '../utils/codeRedemption'
import { logFailedRedeemAttempt } from '../utils/redeemAttemptLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { code } = await readBody(event)
  try {
    return await redeemClaimCode(userId, code)
  } catch (err) {
    await logFailedRedeemAttempt(event, { userId, code, error: err })
    throw err
  }
})
