// DELETE /api/economy/chat/:id — non-live moderation fallback. Soft-deletes a
// chat message (sets deletedAt/deletedByUserId) so it drops out of future
// history.get.js pages. The chat UI itself uses the `admin:chat:delete`
// socket event instead (server/socket-server.js), since only that path can
// broadcast the removal live to everyone currently viewing the room — this
// endpoint exists for moderation done outside the live chat panel.
import { defineEventHandler, getRequestHeader, getRouterParam, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing message id' })
  }

  try {
    await prisma.chatMessage.update({
      where: { id },
      data: { deletedAt: new Date(), deletedByUserId: me.id }
    })
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  }

  return { ok: true }
})
