// server/api/admin/cmoon-battle-upgrades/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const upgrade = await db.cMoonBattleUpgrade.findUnique({
    where: { id },
    include: { _count: { select: { purchases: true } } },
  })
  if (!upgrade) throw createError({ statusCode: 404, statusMessage: 'Upgrade not found' })

  // Friendly pre-check message; UserCMoonBattleUpgrade.upgrade's ON DELETE RESTRICT (see
  // prisma/schema.prisma) is the real race-proof backstop below, same pattern as
  // cmoon-special-attacks/[id].delete.js's own P2003 catch.
  if (upgrade._count?.purchases > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete — ${upgrade._count.purchases} player(s) have already purchased this upgrade. Set it inactive instead.`,
    })
  }

  try {
    await db.cMoonBattleUpgrade.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete — this upgrade has already been purchased. Set it inactive instead.' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonBattleUpgrade', key: `delete:${id}`, prevValue: { name: upgrade.name }, newValue: null })

  return { ok: true }
})
