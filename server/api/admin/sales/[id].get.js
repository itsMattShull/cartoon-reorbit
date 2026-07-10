// GET /api/admin/sales/:id — full detail incl. items, for the edit modal.
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

  const id = event.context.params.id
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          ctoon: {
            select: { id: true, name: true, assetPath: true, rarity: true, price: true, isSecondEdition: true }
          }
        }
      }
    }
  })
  if (!sale) throw createError({ statusCode: 404, statusMessage: 'Sale not found' })

  const now = new Date()
  let status = 'upcoming'
  if (now >= sale.startAt && now <= sale.endAt) status = 'active'
  else if (now > sale.endAt) status = 'ended'

  return { ...sale, status }
})
