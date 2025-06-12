
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

  // include the full Ctoon record
  const items = await prisma.wishlistItem.findMany({
    where: { userId: userId },
    include: { ctoon: true }
  })

  // return an array of full Ctoon objects
  return items.map(i => i.ctoon)
})
