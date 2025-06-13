// server/api/wishlist/[ctoonId].delete.js
import { defineEventHandler, createError, getRequestHeader } from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) auth (as you already have it)…
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2) deleteMany never throws if zero rows matched
  await prisma.wishlistItem.deleteMany({
    where: { userId, ctoonId: event.context.params.ctoonId }
  })

  return { success: true }
})
