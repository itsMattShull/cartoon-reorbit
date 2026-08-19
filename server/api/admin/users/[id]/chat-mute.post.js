// server/api/admin/users/[id]/chat-mute.post.js
//
// Times a user out of the Discord chat relay without touching the rest of their
// account.
//
// This exists because the relay is asymmetric. Every message the site sends
// reaches Discord through one webhook identity, so a Discord moderator's own
// tools — timeout, kick, ban, per-user AutoMod — cannot single out a site user.
// Without this endpoint the only lever a moderator could ask for is banning the
// whole account, which is wildly disproportionate for someone being annoying in
// chat.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const MAX_MINUTES = 60 * 24 * 30 // 30 days

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
  // minutes === 0 clears the mute.
  const minutes = Number(body?.minutes)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_MINUTES) {
    throw createError({
      statusCode: 400,
      statusMessage: `minutes must be an integer between 0 and ${MAX_MINUTES}`
    })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, chatMutedUntil: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const chatMutedUntil = minutes === 0 ? null : new Date(Date.now() + minutes * 60_000)

  await prisma.user.update({ where: { id }, data: { chatMutedUntil } })

  await logAdminChange(prisma, {
    userId: me.id,
    targetUserId: id,
    area: 'User',
    key: 'chatMutedUntil',
    prevValue: target.chatMutedUntil ? target.chatMutedUntil.toISOString() : null,
    newValue: chatMutedUntil ? chatMutedUntil.toISOString() : null
  })

  // No cache to invalidate: the socket handler re-reads this column on every
  // send precisely so a mute takes effect on the user's next message rather
  // than whenever their tab happens to reconnect.
  return { ok: true, chatMutedUntil }
})
