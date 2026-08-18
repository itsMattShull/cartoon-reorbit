import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { encodeUserCtoonId } from '@/server/utils/userCtoonId'
import { isFavoritedCopy } from '@/server/utils/favoriteRules'

export default defineEventHandler(async (event) => {
  const requesterId = event.context.userId
  if (!requesterId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const { q = '', limit = '50', ctoonId } = getQuery(event)
  const requestedCtoonId = String(ctoonId || '').trim()

  if (requestedCtoonId) {
    if (!/^[0-9a-fA-F-]{36}$/.test(requestedCtoonId)) return []

    // Favorited copies are dropped from the mint picker rather than returned and
    // greyed. Picking one here does not merely fail — selectCtoonMint feeds it to
    // applyPreselectedCtoons, which assigns the selection WHOLESALE and pins it,
    // bypassing the toggle guard. A disabled CtoonCard never emits `toggle`, so
    // the card would be selected, un-deselectable, and would fail every send.
    //
    // The aggregate branch below is deliberately NOT filtered the same way: its
    // MAX(mintNumber) is returned to the client as "Highest Mint", so excluding
    // favorites there would make that number drop the moment the holder of the
    // top copy favorited it — a precise, pollable, per-mint favorite feed for the
    // most valuable copies in the game. It keeps describing the real population.
    const rows = await prisma.userCtoon.findMany({
      where: {
        isTradeable: true,
        userId: { not: requesterId },
        ctoonId: requestedCtoonId,
        burnedAt: null
      },
      orderBy: [
        { mintNumber: 'asc' },
        { user: { username: 'asc' } }
      ],
      select: {
        id: true,
        userId: true,
        mintNumber: true,
        user: { select: { username: true, avatar: true } },
        favoritedByUserId: true,
        tradeListItems: { select: { userId: true } },
        ctoon: { select: { id: true, name: true, assetPath: true, isSecondEdition: true } }
      }
    })

    // Filtered here rather than in the `where`: "favorited" is a comparison
    // between two columns of the same row, and the Prisma spellings for that
    // interact badly with SQL's NULL semantics — `NOT (col = userId)` is NULL,
    // not true, for the un-favorited rows that are the overwhelming majority, so
    // the terse version silently returns nothing. The row set here is one cToon's
    // copies, so the cost is nil and the shared helper stays the single
    // definition of what "favorited" means.
    return rows.filter(row => !isFavoritedCopy(row)).map(row => ({
      userCtoonId: encodeUserCtoonId(row.userId, row.ctoon.id, row.mintNumber),
      ctoonId: row.ctoon.id,
      name: row.ctoon.name,
      assetPath: row.ctoon.assetPath,
      isSecondEdition: row.ctoon.isSecondEdition,
      mintNumber: row.mintNumber,
      ownerUsername: row.user.username,
      ownerAvatar: row.user.avatar,
      isTradeListItem: row.tradeListItems.some(item => item.userId === row.userId)
    }))
  }

  const query = String(q || '').trim()
  if (query.length < 3) return []

  const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100)
  const like = `%${query}%`

  const rows = await prisma.$queryRaw`
    SELECT
      c."id" AS "ctoonId",
      c."name" AS "name",
      c."assetPath" AS "assetPath",
      c."isSecondEdition" AS "isSecondEdition",
      MAX(uc."mintNumber") AS "highestMint"
    FROM "UserCtoon" uc
    JOIN "Ctoon" c ON c."id" = uc."ctoonId"
    JOIN "User" u ON u."id" = uc."userId"
    WHERE uc."isTradeable" = true
      AND u."id" <> ${requesterId}
      AND (
        c."name" ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM unnest(c."characters") ch WHERE ch ILIKE ${like}
        )
      )
    GROUP BY c."id"
    ORDER BY c."name" ASC
    LIMIT ${take}
  `

  return rows.map(row => ({
    ctoonId: row.ctoonId,
    name: row.name,
    assetPath: row.assetPath,
    isSecondEdition: row.isSecondEdition,
    highestMint: row.highestMint ?? 0
  }))
})
