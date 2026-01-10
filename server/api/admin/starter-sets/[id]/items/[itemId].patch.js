import { defineEventHandler, getRequestHeader, getRouterParam, readBody, createError } from 'h3'
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
  const body = await readBody(event)
  const desired = typeof body?.position === 'number' ? body.position : null
  if (desired === null) throw createError({ statusCode: 400, statusMessage: 'position is required' })

  const items = await prisma.starterSetItem.findMany({
    where: { setId },
    orderBy: { position: 'asc' }
  })
  const currentIndex = items.findIndex(i => i.id === itemId)
  if (currentIndex === -1) throw createError({ statusCode: 404, statusMessage: 'Item not found in set' })

  const newIndex = Math.max(0, Math.min(desired, items.length - 1))
  if (newIndex === currentIndex) return { ok: true } // no-op

  // Reorder in memory
  const moving = items[currentIndex]
  const without = items.filter(i => i.id !== itemId)
  without.splice(newIndex, 0, moving)
  const updates = without.map((it, idx) => ({ id: it.id, position: idx }))

  // Persist in a transaction
  await prisma.$transaction(
    updates.map(u =>
      prisma.starterSetItem.update({ where: { id: u.id }, data: { position: u.position } })
    )
  )

  return { ok: true }
})
