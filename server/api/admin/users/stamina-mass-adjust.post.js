// server/api/admin/users/stamina-mass-adjust.post.js — raise/lower every player's cMoon battle
// stamina at once, either BY a relative delta or TO an absolute number, for the "Manage User HP"
// admin tool's Stamina section. Both modes write User.cMoonStaminaAdjustment (additive), never an
// absolute stored stamina — see server/utils/cmoonStaminaAdjustmentOps.js's massAdjustStamina for
// the batched implementation.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { validateMassStaminaAdjustBody } from '@/server/utils/cmoonStaminaAdjustmentValidation'
import { massAdjustStamina } from '@/server/utils/cmoonStaminaAdjustmentOps'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = validateMassStaminaAdjustBody(body)
  if (parsed.error) throw createError({ statusCode: 400, statusMessage: parsed.error })

  const result = await massAdjustStamina(parsed)
  if (result.skipped) throw createError({ statusCode: 409, statusMessage: result.reason })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'cMoonStaminaAdjustment:mass',
    prevValue: null,
    newValue: { mode: parsed.mode, value: parsed.value, changed: result.changed },
  })

  return { ok: true, changed: result.changed }
})
