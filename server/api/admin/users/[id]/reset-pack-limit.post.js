// server/api/admin/users/[id]/reset-pack-limit.post.js
// Lets an admin reset a user's Pack.dailyPurchaseLimit for one pack, so they
// can buy up to the limit again today. See server/utils/packDailyWindow.js
// for how this watermark is consulted at purchase time.

import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
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

  const body = await readBody(event)
  const packId = body?.packId
  if (!packId || typeof packId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'packId required' })
  }

  const [target, pack] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, username: true } }),
    prisma.pack.findUnique({ where: { id: packId }, select: { id: true, name: true, dailyPurchaseLimit: true } })
  ])
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (!pack) throw createError({ statusCode: 404, statusMessage: 'Pack not found' })
  if (pack.dailyPurchaseLimit == null) {
    throw createError({ statusCode: 400, statusMessage: 'This pack has no daily purchase limit to reset' })
  }

  const reset = await prisma.userPackLimitReset.upsert({
    where: { userId_packId: { userId: target.id, packId: pack.id } },
    update: { resetAt: new Date(), adminId: me.id },
    create: { userId: target.id, packId: pack.id, adminId: me.id }
  })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'resetPackLimit',
    prevValue: null,
    newValue: { packId: pack.id, packName: pack.name, resetAt: reset.resetAt },
    targetUserId: target.id,
    targetUsername: target.username
  })

  return { ok: true, packId: pack.id, resetAt: reset.resetAt }
})
