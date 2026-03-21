import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  if (userCtoonId) {
    userCtoon = await prisma.userCtoon.findUnique({
      where: { id: userCtoonId },
      include: { ctoon: true }
    })
    if (!userCtoon) {
      throw createError({ statusCode: 404, statusMessage: 'User cToon not found' })
    }
    ctoon = userCtoon.ctoon
  }

  if (!ctoon) {
    ctoon = await prisma.ctoon.findUnique({ where: { id: ctoonId } })
    if (!ctoon) {
      throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
    }
  }

  const mintAgg = await prisma.userCtoon.aggregate({
    where: { ctoonId: ctoon.id },
    _max: { mintNumber: true }
  })
  const highestMint = mintAgg._max.mintNumber ?? ctoon.totalMinted ?? 0

  const [highestSale, lowestSale, overallTradeCount, overallStats, ownedCount] = await Promise.all([
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
    })
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
    userStats = {
      id: userCtoon.id,
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
      quantity: ctoon.quantity,
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
      medianSale: overallMedianSale
    },
    userCtoon: userStats,
    ownedCount
  }
})
