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

  const wishlistCtoonIds = wishlistItems.map(item => item.ctoonId)

  // 3. Fetch the IDs of all cToons this user owns
  // 4. Find which wishlisted cToons have at least one tradable owner (any user)
  const [ownedRecords, tradableRecords] = await Promise.all([
    prisma.userCtoon.findMany({
      where: { userId },
      select: { ctoonId: true }
    }),
    prisma.userTradeListItem.findMany({
      where: {
        userCtoon: {
          ctoonId: { in: wishlistCtoonIds },
          burnedAt: null
        }
      },
      select: { userCtoon: { select: { ctoonId: true } } }
    })
  ])

  const ownedIds         = new Set(ownedRecords.map(r => r.ctoonId))
  const tradableCtoonIds = new Set(tradableRecords.map(r => r.userCtoon.ctoonId))

  // 5. Map to plain ctoon objects with isOwned and hasTradableOwner flags
  return wishlistItems.map(({ ctoon }) => ({
    ...ctoon,
    isOwned:          ownedIds.has(ctoon.id),
    hasTradableOwner: tradableCtoonIds.has(ctoon.id)
  }))
})
