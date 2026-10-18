// File: server/api/game/oggtoons/tutorial.post.js
// Marks the original gToons (2002) tutorial as seen for the caller (finished, skipped or exited).
// Idempotent: the first timestamp is kept.
import { defineEventHandler, createError, getRequestHeader } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  await prisma.user.updateMany({
    where: { id: me.id, ogGtoonsTutorialSeenAt: null },
    data: { ogGtoonsTutorialSeenAt: new Date() }
  })
  return { seen: true }
})
