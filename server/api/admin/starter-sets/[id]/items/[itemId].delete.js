import { defineEventHandler, getRequestHeader, getRouterParam, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const setId = getRouterParam(event, 'id')
  const itemId = getRouterParam(event, 'itemId')

  const item = await prisma.starterSetItem.findUnique({ where: { id: itemId } })
  if (!item || item.setId !== setId) {
    throw createError({ statusCode: 404, statusMessage: 'Item not found in set' })
  }

  await prisma.starterSetItem.delete({ where: { id: itemId } })

  // Compact positions after deletion
  const remain = await prisma.starterSetItem.findMany({
    where: { setId },
    orderBy: { position: 'asc' }
  })
  await prisma.$transaction(
    remain.map((r, idx) =>
      prisma.starterSetItem.update({ where: { id: r.id }, data: { position: idx } })
    )
  )

  return { ok: true }
})
