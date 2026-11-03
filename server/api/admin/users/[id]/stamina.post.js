// server/api/admin/users/[id]/stamina.post.js — set one user's effective cMoon battle stamina
// to an exact number, via an additive User.cMoonStaminaAdjustment (see server/utils/
// cmoonStaminaAdjustmentOps.js / computeStaminaAdjustmentForTarget for why this is additive, not
// an absolute override).
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { validateSetUserStaminaBody } from '@/server/utils/cmoonStaminaAdjustmentValidation'
import { setUserStamina } from '@/server/utils/cmoonStaminaAdjustmentOps'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const parsed = validateSetUserStaminaBody(body)
  if (parsed.error) throw createError({ statusCode: 400, statusMessage: parsed.error })

  const after = await setUserStamina(id, parsed.targetStamina)
  if (!after) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'cMoonStaminaAdjustment',
    prevValue: { adjustment: after.previousAdjustment, effectiveStamina: after.previousEffectiveStamina },
    newValue: { adjustment: after.adjustment, effectiveStamina: after.effectiveStamina, targetStamina: parsed.targetStamina },
    targetUserId: id,
    targetUsername: after.username,
  })

  return {
    ok: true,
    id: after.id,
    username: after.username,
    naturalStamina: after.naturalStamina,
    adjustment: after.adjustment,
    effectiveStamina: after.effectiveStamina,
  }
})
