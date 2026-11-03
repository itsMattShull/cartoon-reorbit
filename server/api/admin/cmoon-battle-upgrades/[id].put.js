// server/api/admin/cmoon-battle-upgrades/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { validateBattleUpgradeBody } from '@/server/utils/cmoonBattleUpgradeValidation'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const upgrade = await db.cMoonBattleUpgrade.findUnique({ where: { id } })
  if (!upgrade) throw createError({ statusCode: 404, statusMessage: 'Upgrade not found' })

  const body = await readBody(event)
  const parsed = validateBattleUpgradeBody(body, upgrade)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  // Changing `stat` on an upgrade players have already bought would silently misattribute every
  // past purchase's HP grant as Stamina (or vice versa) the next time prestige tries to reverse
  // it (see cmoonPrestige.js's own reset, which trusts the upgrade's CURRENT stat for every past
  // purchase). Amount/price/purchaseLimit changing after the fact is fine — prestige always
  // reads today's `amount`, so a later change only affects future purchases and future resets
  // consistently, never a stale mix of old-vs-new math for the same player.
  if (parsed.data.stat !== upgrade.stat) {
    const purchaseCount = await db.userCMoonBattleUpgrade.count({ where: { upgradeId: id } })
    if (purchaseCount > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Cannot change the stat (HP/Stamina) of an upgrade players have already purchased — create a new upgrade instead.' })
    }
  }

  await db.cMoonBattleUpgrade.update({ where: { id }, data: parsed.data })

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonBattleUpgrade', key: `update:${id}`,
    prevValue: { name: upgrade.name, stat: upgrade.stat, amount: upgrade.amount, price: upgrade.price, purchaseLimit: upgrade.purchaseLimit, active: upgrade.active },
    newValue: { name: parsed.data.name, stat: parsed.data.stat, amount: parsed.data.amount, price: parsed.data.price, purchaseLimit: parsed.data.purchaseLimit, active: parsed.data.active },
  })

  return { ok: true }
})
