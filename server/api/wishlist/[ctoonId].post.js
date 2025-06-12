import {
  defineEventHandler,
  getRequestHeader,
  createError,
  getQuery
} from 'h3'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1. Authenticate user
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me && me.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { ctoonId } = event.context.params

  // 2) Upsert: insert if missing, else do nothing
  const item = await prisma.wishlistItem.upsert({
    where: {
      userId_ctoonId: {
        userId: userId,
        ctoonId
      }
    },
    create: {
      userId: userId,
      ctoonId
    },
    update: {}  // no-op if already exists
  })

  return { success: true, item }
})