// server/api/admin/users/[id]/make-admin.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

// Hard-coded super-admin Discord ID allowed to grant admin
const SUPER_ADMIN_DISCORD_ID = '732319322093125695'

export default defineEventHandler(async (event) => {
  // Authenticate via existing session -> /api/auth/me
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Only the specific Discord ID can perform this action
  if (!me?.discordId || me.discordId !== SUPER_ADMIN_DISCORD_ID) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Not super admin' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  // Fetch current state to log previous value
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, username: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  // Set isAdmin = true
  await prisma.user.update({ where: { id }, data: { isAdmin: true } })

  // Admin change log (best-effort)
  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'makeAdmin',
    prevValue: { isAdmin: target.isAdmin },
    newValue: { isAdmin: true }
  })

  return { ok: true }
})

