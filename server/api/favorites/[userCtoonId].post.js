// POST /api/favorites/:userCtoonId — mark one copy the caller owns as a favorite.
//
// Favorites shield a copy from OTHER users requesting it in a trade; they never
// stop the owner trading it away themselves. See server/utils/favoriteRules.js.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { favoriteWriteWhere, isUserCtoonUuid } from '@/server/utils/favoriteRules'
import { requireFavoriteActor, checkFavoriteRateLimit } from '@/server/utils/favoriteRequest'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const userId = await requireFavoriteActor(event)
  await checkFavoriteRateLimit(event, userId)

  // Raw UUIDs only — deliberately NOT the synthetic `uc|user|ctoon|mint` token
  // the collection endpoints hand out. That token encodes a null mintNumber as
  // `x`, so every unlimited-edition copy one user owns of one cToon shares an
  // identical token and resolveUserCtoonId picks whichever sorts first. Accepting
  // it here would mean "favorite this specific copy" silently flags an arbitrary
  // sibling, and would keep flagging a different one as copies come and go. Both
  // callers (My Collection and the cToon modal) already hold the real id.
  const userCtoonId = event.context.params?.userCtoonId
  if (!isUserCtoonUuid(userCtoonId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cToon reference' })
  }

  // One conditional statement carries the authorization AND the write, so there
  // is no gap between checking ownership and acting on it, and no way to address
  // a row the caller does not own. `updateMany`, never `update`: Prisma's
  // `update` demands a unique where, which cannot carry userId — reaching for it
  // is exactly the edit that would turn this into "favorite anyone's cToon".
  //
  // The auction predicate is part of the same statement rather than a preceding
  // findFirst for the same reason: a check-then-write would let a favorite and an
  // auction for one copy both commit, which is the state both guards exist to
  // prevent. Contending on the UserCtoon row makes Postgres serialize them
  // against the matching claim in server/api/auctions.post.js.
  const claimed = await prisma.userCtoon.updateMany({
    where: {
      ...favoriteWriteWhere(userCtoonId, userId),
      auctions: { none: { status: 'ACTIVE' } }
    },
    data: { favoritedByUserId: userId }
  })

  if (claimed.count === 0) {
    // Deliberately one message for "not yours", "burned" and "in an auction".
    // The caller either owns the copy and can see its state, or is probing.
    throw createError({
      statusCode: 409,
      statusMessage: 'This cToon cannot be favorited right now. Copies in an active auction must finish first.'
    })
  }

  // A favorite and a public "Make Tradable" listing say opposite things, so the
  // favorite wins and the listing goes. Scoped to this user's own row.
  await prisma.userTradeListItem.deleteMany({ where: { userId, userCtoonId } })

  // Favoriting does NOT withdraw an outstanding offer that already asks for this
  // copy: the offer stays acceptable, because accepting is the owner's own
  // deliberate act and requirement 3 says the owner is never blocked. Reported so
  // the client can say so rather than leaving the user believing the copy is now
  // safe from a trade they already agreed to consider.
  const pendingTrade = await prisma.tradeOfferCtoon.findFirst({
    where: { userCtoonId, tradeOffer: { status: 'PENDING' } },
    select: { id: true }
  })

  return { success: true, isFavorite: true, inPendingTrade: !!pendingTrade }
})
