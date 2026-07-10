// DELETE /api/admin/sales/:id
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { clearActiveSaleCache } from '@/server/utils/activeSaleCache'

async function assertAdmin(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!me.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  return me
}

export default defineEventHandler(async (event) => {
  const me = await assertAdmin(event)
  const id = event.context.params.id

  const existing = await db.sale.findUnique({
    where: { id },
    include: { items: { select: { ctoonId: true, price: true, perDayLimit: true } } }
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Sale not found' })

  await db.$transaction(async (tx) => {
    await tx.sale.delete({ where: { id } })
    await logAdminChange(tx, {
      userId: me.id,
      area: `Sale:${id}`,
      key: 'delete',
      prevValue: {
        name: existing.name,
        startAt: existing.startAt,
        endAt: existing.endAt,
        items: existing.items
      },
      newValue: null
    })
  })

  clearActiveSaleCache()

  return { success: true }
})
