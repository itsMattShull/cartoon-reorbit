// Polled by pages/redeem.vue once it's shown "Redeeming…" for a specific code (see
// server/utils/codeRedemption.js's handicap branch). Returns `{ redeeming: true }` while the
// hold is still open, or the exact success shape a normal on-time redemption would have
// returned once it's released — the client's existing reward-rendering code handles both the
// same way a plain POST /api/redeem response always has.
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { retryReleaseUserHold } from '@/server/utils/codeRedemption'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { code } = getQuery(event)
  if (!code || typeof code !== 'string') throw createError({ statusCode: 400, statusMessage: 'Code is required' })

  const claimCode = await prisma.claimCode.findUnique({ where: { code }, select: { id: true } })
  if (!claimCode) throw createError({ statusCode: 404, statusMessage: 'Invalid code' })

  // Each poll doubles as a retry: if the hold is still PENDING but 3 other players have now
  // claimed this code, release it here rather than waiting for yet another claim to trigger it.
  await retryReleaseUserHold(userId, claimCode.id, code)

  const hold = await prisma.handicapRedeemHold.findUnique({ where: { userId_codeId: { userId, codeId: claimCode.id } } })
  if (!hold) throw createError({ statusCode: 404, statusMessage: 'Nothing pending for this code' })

  // RELEASING (claimed by a release attempt that hasn't finished yet) reads exactly like
  // PENDING here — see releaseHold's own comment on why that in-between state exists at all.
  if (hold.status !== 'COMPLETED') return { redeeming: true }

  let result
  try { result = JSON.parse(hold.resultJson || '{}') } catch { result = {} }
  return { redeeming: false, ...result }
})
