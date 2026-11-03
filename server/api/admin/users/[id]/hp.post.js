// server/api/admin/users/[id]/hp.post.js — set one user's effective cMoon battle HP to an exact
// number, via an additive User.cMoonHpAdjustment (see server/utils/cmoonHpAdjustmentOps.js /
// computeHpAdjustmentForTarget for why this is additive, not an absolute override).
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { validateSetUserHpBody } from '@/server/utils/cmoonHpAdjustmentValidation'
import { setUserHp } from '@/server/utils/cmoonHpAdjustmentOps'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const parsed = validateSetUserHpBody(body)
  if (parsed.error) throw createError({ statusCode: 400, statusMessage: parsed.error })

  const after = await setUserHp(id, parsed.targetHp)
  if (!after) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'cMoonHpAdjustment',
    prevValue: { adjustment: after.previousAdjustment, effectiveHp: after.previousEffectiveHp },
    newValue: { adjustment: after.adjustment, effectiveHp: after.effectiveHp, targetHp: parsed.targetHp },
    targetUserId: id,
    targetUsername: after.username,
  })

  return {
    ok: true,
    id: after.id,
    username: after.username,
    naturalHp: after.naturalHp,
    adjustment: after.adjustment,
    effectiveHp: after.effectiveHp,
  }
})
