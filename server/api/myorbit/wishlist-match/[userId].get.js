// Live, low-stakes "psst, they have something on your wishlist" hint for a nearby MyOrbit
// avatar — not a trade offer or an oracle into the other player's own wishlist (compare
// server/api/ctoon/[id]/wishlisted-by.get.js's own comment on why that endpoint returns
// usernames only, never points): this is the reverse direction, "how many things THEY currently
// own does MY OWN wishlist want," and returns only a count, nothing identifying which cToons.
//
// Reuses the same lock/pending-trade exclusion logic every other "can this copy actually be
// traded away" check in this codebase uses (pendingTradeGuardWhere, isLockedCopy) rather than
// re-deriving it — see server/api/collection/[username].get.js for the sibling query this
// mirrors. burnedAt is checked explicitly here (that collection endpoint relies on isTradeable
// alone, which this duplicates for safety rather than assuming its invariant holds).
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { pendingTradeGuardWhere } from '@/server/utils/tradeOfferRules'
import { isLockedCopy } from '@/server/utils/lockRules'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  const otherUserId = event.context.params?.userId
  if (!otherUserId || otherUserId === event.context.userId) return { count: 0 }

  const wishlistCtoonIds = (await db.wishlistItem.findMany({
    where: { userId: event.context.userId },
    select: { ctoonId: true }
  })).map(w => w.ctoonId)
  if (!wishlistCtoonIds.length) return { count: 0 }

  const theirCopies = await db.userCtoon.findMany({
    where: {
      userId: otherUserId,
      ctoonId: { in: wishlistCtoonIds },
      isTradeable: true,
      burnedAt: null
    },
    select: { id: true, userId: true, lockedByUserId: true, ctoonId: true }
  })
  if (!theirCopies.length) return { count: 0 }

  const pendingIds = new Set((await db.tradeOfferCtoon.findMany({
    where: pendingTradeGuardWhere(theirCopies.map(c => c.id)),
    select: { userCtoonId: true }
  })).map(r => r.userCtoonId))

  const tradableCtoonIds = new Set(
    theirCopies
      .filter(c => !isLockedCopy(c) && !pendingIds.has(c.id))
      .map(c => c.ctoonId)
  )
  return { count: tradableCtoonIds.size }
})
