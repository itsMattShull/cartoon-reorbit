// server/api/admin/users/[id]/locked-points.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Auth: must be admin
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

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const locks = await prisma.lockedPoints.findMany({
    where: { userId: id, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      reason: true,
      contextType: true,
      contextId: true,
      createdAt: true
    }
  })

  const totals = { AUCTION: 0, TRADE: 0 }
  for (const lock of locks) {
    if (lock.contextType === 'AUCTION') totals.AUCTION += lock.amount || 0
    if (lock.contextType === 'TRADE') totals.TRADE += lock.amount || 0
  }

  const totalLocked = totals.AUCTION + totals.TRADE

  return {
    totalLocked,
    byType: totals,
    locks
  }
})
