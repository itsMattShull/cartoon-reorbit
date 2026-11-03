// server/api/admin/users/hp-mass-adjust.post.js — raise/lower every player's cMoon battle HP at
// once, either BY a relative delta or TO an absolute number, for the "Manage User HP" admin tool.
// Both modes write User.cMoonHpAdjustment (additive), never an absolute stored HP — see
// server/utils/cmoonHpAdjustmentOps.js's massAdjustHp for the batched implementation.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { validateMassHpAdjustBody } from '@/server/utils/cmoonHpAdjustmentValidation'
import { massAdjustHp } from '@/server/utils/cmoonHpAdjustmentOps'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = validateMassHpAdjustBody(body)
  if (parsed.error) throw createError({ statusCode: 400, statusMessage: parsed.error })

  const result = await massAdjustHp(parsed)
  if (result.skipped) throw createError({ statusCode: 409, statusMessage: result.reason })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'cMoonHpAdjustment:mass',
    prevValue: null,
    newValue: { mode: parsed.mode, value: parsed.value, changed: result.changed },
  })

  return { ok: true, changed: result.changed }
})
