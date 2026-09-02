// DELETE /api/economy/chat/:id — admin moderation kill-switch. Soft-deletes a
// chat message (sets deletedAt) so it drops out of future history.get.js
// pages; already-open clients only lose it on their next fetch/rejoin, not
// instantly, which is an accepted v1 tradeoff for a live-delete broadcast.
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
      data: { deletedAt: new Date() }
    })
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  }

  return { ok: true }
})
