import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

function asString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function computeMedian(values) {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  try {
    await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
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

  const [highestSale, lowestSale] = await Promise.all([
    prisma.auction.findFirst({
      where: {
        userCtoon: { ctoonId: ctoon.id },
        status: 'CLOSED',
        winnerId: { not: null }
      },
      orderBy: [{ highestBid: 'desc' }, { endAt: 'desc' }],
      select: { highestBid: true, userCtoon: { select: { mintNumber: true } } }
    }),
    prisma.auction.findFirst({
      where: {
        userCtoon: { ctoonId: ctoon.id },
        status: 'CLOSED',
        winnerId: { not: null }
      },
      orderBy: [{ highestBid: 'asc' }, { endAt: 'desc' }],
      select: { highestBid: true, userCtoon: { select: { mintNumber: true } } }
    })
  ])

  let userStats = null
  if (userCtoon) {
    const [tradeCount, auctions] = await Promise.all([
      prisma.tradeCtoon.count({
        where: {
          userCtoonId: userCtoon.id,
          trade: { confirmed: true }
        }
      }),
      prisma.auction.findMany({
        where: {
          userCtoonId: userCtoon.id,
          status: 'CLOSED',
          winnerId: { not: null }
        },
        select: { highestBid: true }
      })
    ])

    const sales = auctions
      .map(a => a.highestBid)
      .filter(v => typeof v === 'number')
    const avgSale = sales.length
      ? Number((sales.reduce((sum, v) => sum + v, 0) / sales.length).toFixed(2))
      : null
    const medianSale = computeMedian(sales)

    userStats = {
      id: userCtoon.id,
      mintNumber: userCtoon.mintNumber ?? null,
      tradedCount: tradeCount,
      successfulAuctions: sales.length,
      avgSale,
      medianSale
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
      highestMint,
      price: ctoon.price,
      highestSale: highestSale?.highestBid ?? null,
      highestSaleMint: highestSale?.userCtoon?.mintNumber ?? null,
      lowestSale: lowestSale?.highestBid ?? null,
      lowestSaleMint: lowestSale?.userCtoon?.mintNumber ?? null
    },
    userCtoon: userStats
  }
})
