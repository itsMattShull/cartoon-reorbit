// server/api/admin/users.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
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

  // 2) Base users (lightweight select)
  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
    select: {
      id: true,
      username: true,
      discordTag: true,
      discordId: true,
      inGuild: true,
      createdAt: true,
      lastLogin: true,
      lastActivity: true,
      isBooster: true,
      boosterSince: true,
      isAdmin: true,
      active: true,
      banned: true,
      warning180: true,
      warning210: true,
      warning240: true,
      additionalCzones: true,
      points: { select: { points: true } },
    },
  })

  // 3) Counts from UserCtoon (ignore burned)
  // total count per user
  const totals = await prisma.userCtoon.groupBy({
    by: ['userId'],
    where: { burnedAt: null },
    _count: { _all: true },
  })
  const totalMap = new Map(totals.map(t => [t.userId, t._count._all]))

  // unique count per user (distinct ctoonId)
  const uniques = await prisma.userCtoon.groupBy({
    by: ['userId', 'ctoonId'],
    where: { burnedAt: null },
    _count: { _all: true }, // count per pair; we’ll reduce to #distinct ctoonId
  })
  const uniqueMap = new Map()
  for (const row of uniques) {
    uniqueMap.set(row.userId, (uniqueMap.get(row.userId) || 0) + 1)
  }

  // 4) Shape payload
  return users.map(u => ({
    id:            u.id,
    username:      u.username || '(no username)',
    discordTag:    u.discordTag || '(no discord)',
    discordId:     u.discordId || null,
    inGuild:       u.inGuild,
    points:        u.points?.points || 0,

    joined:        u.createdAt,
    lastLogin:     u.lastLogin,
    lastActivity:  u.lastActivity,

    // new: totals
    totalCtoons:   totalMap.get(u.id)  || 0,
    uniqueCtoons:  uniqueMap.get(u.id) || 0,

    isBooster:     u.isBooster,
    boosterSince:  u.boosterSince,
    isAdmin:       u.isAdmin,
    active:        u.active,
    banned:        u.banned,
    additionalCzones: u.additionalCzones ?? 0,

    // keep flat flags for convenience
    warning180:    u.warning180,
    warning210:    u.warning210,
    warning240:    u.warning240,

    // optional nested object if you prefer both
    warnings: {
      '180': u.warning180,
      '210': u.warning210,
      '240': u.warning240,
    },
  }))
})
