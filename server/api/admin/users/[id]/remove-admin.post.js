// server/api/admin/users/[id]/remove-admin.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

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

  // Fetch target user for checks and logging
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, username: true, discordId: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  // Never allow removing admin from the super-admin Discord ID
  if (target.discordId === SUPER_ADMIN_DISCORD_ID) {
    throw createError({ statusCode: 403, statusMessage: 'Cannot remove admin from super admin' })
  }

  // Set isAdmin = false
  await prisma.user.update({ where: { id }, data: { isAdmin: false } })

  // Admin change log (best-effort)
  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'removeAdmin',
    prevValue: { isAdmin: target.isAdmin },
    newValue: { isAdmin: false }
  })

  return { ok: true }
})

