// server/api/admin/cmoon-battle-upgrades.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { validateBattleUpgradeBody } from '@/server/utils/cmoonBattleUpgradeValidation'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = validateBattleUpgradeBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  const created = await db.cMoonBattleUpgrade.create({ data: parsed.data })

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonBattleUpgrade', key: `create:${created.id}`,
    prevValue: null, newValue: { id: created.id, name: parsed.data.name, stat: parsed.data.stat, amount: parsed.data.amount, price: parsed.data.price, purchaseLimit: parsed.data.purchaseLimit },
  })

  return { id: created.id }
})
