// server/api/user/points.get.js

import { defineEventHandler, getRequestHeader, createError } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Authenticate user via existing /api/auth/me
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Fetch or initialize UserPoints
  let record = await prisma.userPoints.findUnique({ where: { userId } })
  if (!record) {
    record = await prisma.userPoints.create({ data: { userId, points: 0 } })
  }

  // 3. Sum this caller's ACTIVE locks. Never any other user's — the only route
  //    that may read someone else's locks is admin-gated
  //    (server/api/admin/users/[id]/locked-points.get.js), and it returns the
  //    individual rows because an admin is investigating. Callers here get one
  //    number: shipping contextIds would leak the user's own live bid positions
  //    into every surface that touches this response, for no benefit.
  const lockAgg = await prisma.lockedPoints.aggregate({
    _sum: { amount: true },
    where: { userId, status: 'ACTIVE' }
  })
  const locked = lockAgg._sum.amount || 0

  // `points` stays the gross balance so existing callers are unaffected.
  // `available` is what the server will actually let this user commit — see the
  // insufficient-points check in server/api/auction/[id]/bid.post.js, which
  // computes exactly this.
  return {
    points: record.points,
    locked,
    available: Math.max(0, record.points - locked)
  }
})
