// DELETE /api/locks/:userCtoonId — clear the caller's lock on one copy.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { lockWriteWhere, isUserCtoonUuid } from '@/server/utils/lockRules'
import { requireLockActor, checkLockRateLimit } from '@/server/utils/lockRequest'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const userId = await requireLockActor(event)
  await checkLockRateLimit(event, userId)

  // Raw UUIDs only, for the reason spelled out in the POST handler.
  const userCtoonId = event.context.params?.userCtoonId
  if (!isUserCtoonUuid(userCtoonId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cToon reference' })
  }

  // Same self-scoping as the POST: the compound where IS the authorization, so a
  // token naming somebody else's copy updates nothing instead of clearing their
  // lock. Switching this to `update({ where: { id } })` would let any
  // authenticated user strip the protection off any copy in the game.
  //
  // A miss returns success rather than 404: unlocking something already
  // unlocked is the caller's intended end state, and distinguishing "not
  // yours" from "not locked" here would answer questions about other people's
  // copies that nothing else on this endpoint answers.
  await prisma.userCtoon.updateMany({
    where: lockWriteWhere(userCtoonId, userId),
    data: { lockedByUserId: null }
  })

  return { success: true, isLocked: false }
})
