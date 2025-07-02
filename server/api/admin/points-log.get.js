// server/api/admin/points-log.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Admin auth
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

  // 2. Fetch *all* logs
  const logs = await prisma.pointsLog.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, username: true } } }
  })

  // 3. Return them
  return logs.map(l => ({
    id:        l.id,
    user:      l.user,
    direction: l.direction,
    points:    l.points,
    method:    l.method,
    createdAt: l.createdAt
  }))
})
