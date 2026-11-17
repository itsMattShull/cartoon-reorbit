// Checked once by pages/newsite/redeem.vue on mount, so a flagged player who left the "Redeeming…"
// state and came back (reload, new tab, next day) resumes polling the right code instead of
// just seeing a blank redeem form with no explanation. Deliberately reports only a still-PENDING
// hold — once a hold COMPLETES, this reports nothing pending (the reward is already sitting in
// their inventory regardless; there is no promise of a one-time "reveal" surviving a reload, see
// HandicapRedeemHold's own schema comment).
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const hold = await prisma.handicapRedeemHold.findFirst({
    // RELEASING (claimed by a release attempt that hasn't finished yet) resumes the same way
    // PENDING does — see releaseHold's own comment, in server/utils/codeRedemption.js, on why
    // that in-between state exists.
    where: { userId, status: { in: ['PENDING', 'RELEASING'] } },
    orderBy: { requestedAt: 'desc' },
    select: { code: { select: { code: true } } }
  })
  if (!hold) return { pending: false }
  return { pending: true, code: hold.code.code }
})
