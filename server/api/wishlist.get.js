import {
  defineEventHandler,
  getRequestHeader,
  createError
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
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Load user's wishlist items (includes full ctoon record)
  const wishlistItems = await prisma.wishlistItem.findMany({
    where: { userId },
    include: { ctoon: true }
  })

  // 3. Fetch the IDs of all cToons this user owns
  const ownedRecords = await prisma.userCtoon.findMany({
    where: { userId },
    select: { ctoonId: true }
  })
  const ownedIds = new Set(ownedRecords.map(r => r.ctoonId))

  // 4. Map to plain ctoon objects with isOwned flag
  return wishlistItems.map(({ ctoon }) => ({
    ...ctoon,
    isOwned: ownedIds.has(ctoon.id)
  }))
})
