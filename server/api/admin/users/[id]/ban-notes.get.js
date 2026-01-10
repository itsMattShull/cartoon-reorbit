// server/api/admin/users/[id]/ban-notes.get.js
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

  const notes = await prisma.userBanNote.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      action: true,
      reason: true,
      createdAt: true,
      admin: { select: { id: true, username: true, discordTag: true } }
    }
  })

  return notes.map(n => ({
    id: n.id,
    action: n.action,
    reason: n.reason,
    createdAt: n.createdAt,
    admin: {
      id: n.admin?.id || null,
      name: n.admin?.username || n.admin?.discordTag || 'Unknown admin'
    }
  }))
})

