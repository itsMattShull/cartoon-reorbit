// server/api/admin/users/[id]/activate.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

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

  // 2) Params
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  // 3) Load target user
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, active: true, banned: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Cannot activate an admin user' })
  if (target.banned) throw createError({ statusCode: 400, statusMessage: 'Cannot activate a banned user. Unban instead.' })
  if (target.active) return { ok: true, active: true }

  // 4) Update DB
  const prev = { active: target.active }
  await prisma.user.update({ where: { id: target.id }, data: { active: true } })

  // 5) Log the admin action (best-effort)
  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'activateUser',
    prevValue: prev,
    newValue: { active: true }
  })

  return { ok: true, active: true }
})

