// File: server/api/game/oggtoons/tutorial.get.js
// Whether the caller has already seen the original gToons (2002) tutorial, so the hub only offers
// it automatically on a first visit. The Replay button never depends on this.
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

  const row = await prisma.user.findUnique({ where: { id: me.id }, select: { ogGtoonsTutorialSeenAt: true } })
  return { seen: !!row?.ogGtoonsTutorialSeenAt }
})
