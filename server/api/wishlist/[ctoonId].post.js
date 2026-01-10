// server/api/wishlist/[ctoonId].post.js
import { defineEventHandler, getRequestHeader, createError, readBody } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { ctoonId } = event.context.params || {}
  if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'Missing ctoonId' })

  // read and validate body
  const body = await readBody(event).catch(() => ({}))
  const offeredPoints = Number(body?.offeredPoints)
  if (!Number.isInteger(offeredPoints) || offeredPoints <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'offeredPoints must be an integer > 0' })
  }

  // upsert with offeredPoints (update if already exists)
  const item = await prisma.wishlistItem.upsert({
    where: { userId_ctoonId: { userId, ctoonId } },
    create: { userId, ctoonId, offeredPoints },
    update: { offeredPoints }
  })

  return { success: true, item }
})
