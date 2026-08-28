import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { isSyntheticUserCtoonId, resolveUserCtoonId, encodeUserCtoonId } from '@/server/utils/userCtoonId'
import { getActiveSale } from '@/server/utils/activeSaleCache'
import { isLockedCopy } from '@/server/utils/lockRules'

function asString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const ctoonId = asString(query.ctoonId)
  const userCtoonId = asString(query.userCtoonId)

  if (!ctoonId && !userCtoonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing ctoonId or userCtoonId' })
  }

  let ctoon = null
  let userCtoon = null

  // Synthetic IDs come in two forms:
  //   cz:…  — positional token from the public cZone view (no per-instance lookup possible)
  //   uc|…  — encoded token from all other endpoints (resolve to real UUID first)
  // For cz: tokens fall through to the ctoonId-only path so the modal still opens.
  const editionInclude = {
    relatedFirstEdition:  { select: { id: true, name: true, assetPath: true } },
    relatedSecondEdition: { select: { id: true, name: true, assetPath: true } },
    // Explicit select, never a bare `cMoon: true` — CMoon also has `members`/
    // `captains` relations that pull full User rows (Discord tokens, email);
    // this endpoint must only ever expose the same public-safe fields as the
    // cMoon-themed modal card needs.
    cMoon: { select: { id: true, name: true, color: true, buttonImagePath: true } }
  }

  if (userCtoonId?.startsWith('uc|')) {
    const realId = await resolveUserCtoonId(userCtoonId)
    if (realId) {
      userCtoon = await prisma.userCtoon.findUnique({ where: { id: realId }, include: { ctoon: { include: editionInclude } } })
      if (userCtoon) ctoon = userCtoon.ctoon
    }
  } else if (userCtoonId && !isSyntheticUserCtoonId(userCtoonId) && !userCtoonId.startsWith('cz:')) {
    userCtoon = await prisma.userCtoon.findUnique({
      where: { id: userCtoonId },
      include: { ctoon: { include: editionInclude } }
    })
    if (userCtoon) ctoon = userCtoon.ctoon
  }

  if (!ctoon) {
    if (!ctoonId) {
      throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
    }
    ctoon = await prisma.ctoon.findUnique({ where: { id: ctoonId }, include: editionInclude })
    if (!ctoon) {
      throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
    }
  }

  const mintAgg = await prisma.userCtoon.aggregate({
    where: { ctoonId: ctoon.id },
    _max: { mintNumber: true }
  })
  const highestMint = mintAgg._max.mintNumber ?? ctoon.totalMinted ?? 0

  // If a time-based cToon's mint window has closed but the finalization job
  // hasn't written the real quantity yet (sentinel still in place), substitute
  // totalMinted so the modal displays the actual count instead of "???".
  const TIME_BASED_CAP = 999999999
  const effectiveQuantity = (
    ctoon.mintLimitType === 'timeBased' &&
    ctoon.mintEndDate &&
    new Date(ctoon.mintEndDate) <= new Date() &&
    ctoon.quantity === TIME_BASED_CAP
  ) ? ctoon.totalMinted : ctoon.quantity

  const activeSale = await getActiveSale()
  const activeSaleItem = activeSale?.items?.find(item => item.ctoon.id === ctoon.id) || null
  const saleImagePath = activeSaleItem ? (activeSale.imagePath || null) : null

  const [highestSale, lowestSale, overallTradeCount, overallStats, ownedCount, totalCzoneCount] = await Promise.all([
    prisma.auction.findFirst({
      where: {
        userCtoon: { ctoonId: ctoon.id },
        status: 'CLOSED',
        winnerId: { not: null }
      },
      orderBy: [{ highestBid: 'desc' }, { endAt: 'desc' }],
      select: { highestBid: true, endAt: true, userCtoon: { select: { mintNumber: true } } }
    }),
    prisma.auction.findFirst({
      where: {
        userCtoon: { ctoonId: ctoon.id },
        status: 'CLOSED',
        winnerId: { not: null }
      },
      orderBy: [{ highestBid: 'asc' }, { endAt: 'desc' }],
      select: { highestBid: true, endAt: true, userCtoon: { select: { mintNumber: true } } }
    }),
    prisma.tradeOffer.count({
      where: {
        status: 'ACCEPTED',
        ctoons: { some: { userCtoon: { ctoonId: ctoon.id } } }
      }
    }),
    prisma.$queryRaw`
      SELECT
        COUNT(*)::int                                                            AS count,
        ROUND(AVG(a."highestBid")::numeric, 2)::float                           AS avg_bid,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY a."highestBid")::float      AS median_bid
      FROM "Auction" a
      JOIN "UserCtoon" uc ON a."userCtoonId" = uc.id
      WHERE uc."ctoonId" = ${ctoon.id}
        AND a.status = 'CLOSED'
        AND a."winnerId" IS NOT NULL
    `,
    prisma.userCtoon.count({
      where: { userId: me.id, ctoonId: ctoon.id }
    }),
    // Cheap live count (no precompute needed) — the expensive part this
    // stat depends on is czoneDisplayCount below, which is precomputed
    // daily by server/cron/czone-display-count.js.
    prisma.cZone.count()
  ])

  const overallRow = overallStats[0] ?? {}
  const overallSaleCount  = Number(overallRow.count   ?? 0)
  const overallAvgSale    = overallRow.avg_bid    != null ? Number(overallRow.avg_bid)    : null
  const overallMedianSale = overallRow.median_bid != null ? Number(overallRow.median_bid) : null

  let userStats = null
  if (userCtoon) {
    const [tradeCount, userAuctionStats] = await Promise.all([
      prisma.tradeOffer.count({
        where: {
          status: 'ACCEPTED',
          ctoons: { some: { userCtoonId: userCtoon.id } }
        }
      }),
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int                                                            AS count,
          ROUND(AVG("highestBid")::numeric, 2)::float                             AS avg_bid,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "highestBid")::float        AS median_bid
        FROM "Auction"
        WHERE "userCtoonId" = ${userCtoon.id}
          AND status = 'CLOSED'
          AND "winnerId" IS NOT NULL
      `
    ])

    const uRow = userAuctionStats[0] ?? {}
    // This endpoint deliberately serves per-copy stats for ANY userCtoonId — it
    // never checks that the caller owns the copy, and the `uc|user|ctoon|mint`
    // token is a pure function of three values the Owners tab and the auction
    // house publish, so tokens for other people's copies are trivially
    // constructed. That is fine for sale history; it is not fine for a lock,
    // which would otherwise be readable one copy at a time for the whole game.
    // So ownership is what gates it, not knowledge of the token.
    const isOwner = userCtoon.userId === me.id
    userStats = {
      id: encodeUserCtoonId(userCtoon.userId, userCtoon.ctoonId, userCtoon.mintNumber),
      // The real row id, for the locks routes — they take a UUID rather than
      // the token, which cannot address a specific copy of an unlimited edition.
      // Owner-only for the same reason as isLocked.
      ...(isOwner ? { userCtoonId: userCtoon.id, isLocked: isLockedCopy(userCtoon) } : {}),
      isOwner,
      mintNumber: userCtoon.mintNumber ?? null,
      tradedCount: tradeCount,
      successfulAuctions: Number(uRow.count ?? 0),
      avgSale:    uRow.avg_bid    != null ? Number(uRow.avg_bid)    : null,
      medianSale: uRow.median_bid != null ? Number(uRow.median_bid) : null
    }
  }

  return {
    ctoon: {
      id: ctoon.id,
      name: ctoon.name,
      assetPath: ctoon.assetPath,
      rarity: ctoon.rarity,
      set: ctoon.set,
      series: ctoon.series,
      description: ctoon.description,
      characters: ctoon.characters,
      releaseDate: ctoon.releaseDate,
      highestMint,
      quantity: effectiveQuantity,
      inCmart: ctoon.inCmart,
      price: ctoon.price,
      soundPath: ctoon.soundPath ?? null,
      type: ctoon.type,
      isGtoon: ctoon.isGtoon,
      gtoonType: ctoon.gtoonType,
      cost: ctoon.cost,
      power: ctoon.power,
      abilityKey: ctoon.abilityKey,
      abilityData: ctoon.abilityData,
      highestSale: highestSale?.highestBid ?? null,
      highestSaleMint: highestSale?.userCtoon?.mintNumber ?? null,
      highestSaleEndedAt: highestSale?.endAt ?? null,
      lowestSale: lowestSale?.highestBid ?? null,
      lowestSaleMint: lowestSale?.userCtoon?.mintNumber ?? null,
      lowestSaleEndedAt: lowestSale?.endAt ?? null,
      tradedCount: overallTradeCount,
      successfulAuctions: overallSaleCount,
      avgSale: overallAvgSale,
      medianSale: overallMedianSale,
      isSecondEdition: ctoon.isSecondEdition,
      secondEditionOverlayX: ctoon.secondEditionOverlayX,
      secondEditionOverlayY: ctoon.secondEditionOverlayY,
      secondEditionOverlaySize: ctoon.secondEditionOverlaySize,
      relatedFirstEdition: ctoon.relatedFirstEdition ?? null,
      relatedSecondEdition: ctoon.relatedSecondEdition ?? null,
      saleImagePath,
      czoneDisplayCount: ctoon.czoneDisplayCount ?? 0,
      cMoon: ctoon.cMoon ?? null
    },
    userCtoon: userStats,
    ownedCount,
    totalCzoneCount
  }
})
