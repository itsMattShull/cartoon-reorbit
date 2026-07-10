// GET /api/admin/sales — list all Sales with item counts + computed status.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

async function assertAdmin(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!me.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
}

export default defineEventHandler(async (event) => {
  await assertAdmin(event)

  const now = new Date()
  const sales = await db.sale.findMany({
    orderBy: { startAt: 'desc' },
    include: { _count: { select: { items: true } } }
  })

  return sales.map(({ _count, ...sale }) => {
    let status = 'upcoming'
    if (now >= sale.startAt && now <= sale.endAt) status = 'active'
    else if (now > sale.endAt) status = 'ended'
    return { ...sale, itemCount: _count.items, status }
  })
})
