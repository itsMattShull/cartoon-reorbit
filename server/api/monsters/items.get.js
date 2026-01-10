// server/api/monsters/items.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const cfg = await db.barcodeGameConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  const where = {
    userId: String(me.id),
    isUsed: false,
    item: { effect: 'HEAL' },
  }
  if (cfg?.id) where.configId = cfg.id

  const rows = await db.userMonsterItem.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      item: {
        select: {
          name: true,
          power: true,
          effect: true,
          itemImage0Path: true,
          itemImage1Path: true,
          itemImage2Path: true,
        },
      },
    },
  })

  const items = rows.map((row) => ({
    id: row.id,
    name: row.item?.name || 'Item',
    power: row.item?.power ?? 0,
    effect: row.item?.effect || null,
    itemImage0Path: row.item?.itemImage0Path || null,
    itemImage1Path: row.item?.itemImage1Path || null,
    itemImage2Path: row.item?.itemImage2Path || null,
  }))

  return { items }
})
