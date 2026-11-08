// server/api/admin/cmoon-battle-upgrades.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const upgrades = await db.cMoonBattleUpgrade.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { purchases: true } } },
  })

  return {
    upgrades: upgrades.map(u => ({
      id: u.id,
      name: u.name,
      description: u.description,
      stat: u.stat,
      amount: u.amount,
      price: u.price,
      purchaseLimit: u.purchaseLimit,
      active: u.active,
      sortOrder: u.sortOrder,
      purchaseCount: u._count?.purchases ?? 0,
    })),
  }
})
