// server/api/admin/users/transfer-preview.get.js
// Resolves a source/target user pair and reports what a transfer would move,
// without changing anything. The confirmation modal calls this once after
// the admin picks both users, then shows the returned counts on both
// confirmation screens (never re-derives them from client-side state).
import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { resolveTransferPair } from '@/server/utils/transferValidation'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { sourceUserId, targetUserId } = getQuery(event)
  if (typeof sourceUserId !== 'string' || typeof targetUserId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'sourceUserId and targetUserId are required' })
  }

  const { source, target } = await resolveTransferPair(sourceUserId, targetUserId)

  const [points, ctoonCount] = await Promise.all([
    db.userPoints.findUnique({ where: { userId: source.id }, select: { points: true } }),
    db.userCtoon.count({ where: { userId: source.id, burnedAt: null } }),
  ])

  return {
    source: { id: source.id, username: source.username, isAdmin: source.isAdmin },
    target: { id: target.id, username: target.username, isAdmin: target.isAdmin },
    points: Math.max(0, points?.points || 0),
    ctoonCount,
  }
})
