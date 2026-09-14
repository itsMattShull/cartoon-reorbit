import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/prisma'

// Average sale price of a cToon's last 5 completed (sold) auctions, keyed by
// ctoonId. "Sold" = CLOSED with a winner — an auction that closed with no
// bids has no winnerId and tells us nothing about market value.
async function getRecentAuctionAverages(ctoonIds) {
  const map = new Map()
  if (!ctoonIds.length) return map

  const rows = await prisma.$queryRaw`
    SELECT "ctoonId", AVG("highestBid")::float AS "avgPrice"
    FROM (
      SELECT uc."ctoonId" AS "ctoonId", a."highestBid" AS "highestBid",
        ROW_NUMBER() OVER (PARTITION BY uc."ctoonId" ORDER BY a."winnerAt" DESC) AS rn
      FROM "Auction" a
      JOIN "UserCtoon" uc ON uc.id = a."userCtoonId"
      WHERE a.status = 'CLOSED' AND a."winnerId" IS NOT NULL
        AND uc."ctoonId" IN (${Prisma.join(ctoonIds)})
    ) sub
    WHERE rn <= 5
    GROUP BY "ctoonId"
  `
  for (const row of rows) {
    map.set(row.ctoonId, row.avgPrice)
  }
  return map
}

function parseStartYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

function parseEndYMD(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999Z`)
  return isNaN(d.getTime()) ? null : d
}

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const query = getQuery(event)
  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 200)
  const skip = (page - 1) * limit
  const status = typeof query.status === 'string' ? query.status.trim() : ''
  const user = typeof query.user === 'string' ? query.user.trim() : ''
  const from = typeof query.from === 'string' ? parseStartYMD(query.from) : null
  const to = typeof query.to === 'string' ? parseEndYMD(query.to) : null

  const where = {
    ...(status ? { status } : {}),
    ...(user
      ? {
          OR: [
            { initiator: { username: { contains: user, mode: 'insensitive' } } },
            { recipient: { username: { contains: user, mode: 'insensitive' } } }
          ]
        }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {})
          }
        }
      : {})
  }

  // 2) Fetch offers
  const [total, offers] = await Promise.all([
    prisma.tradeOffer.count({ where }),
    prisma.tradeOffer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        initiator: { select: { id: true, username: true } },
        recipient: { select: { id: true, username: true } },
        // Lineage only — ids, never the other offer's contents. Both offers in
        // a counter chain always have the same two parties, but there is no
        // reason to re-serialize a whole second offer to say "this was
        // countered".
        counteredBy: { select: { id: true } },
        ctoons: {
          include: {
            userCtoon: {
              select: {
                mintNumber: true,
                ctoon: {
                  select: { id: true, name: true, rarity: true, assetPath: true, price: true }
                }
              }
            }
          }
        }
      }
    })
  ])

  // 3) Value each cToon: average of its last 5 sold auctions, falling back to
  // cMart price when it's never sold at auction.
  const ctoonIds = [...new Set(offers.flatMap(o => o.ctoons.map(x => x.userCtoon.ctoon.id)))]
  const auctionAverages = await getRecentAuctionAverages(ctoonIds)
  function valueCtoon(ctoon) {
    const avg = auctionAverages.get(ctoon.id)
    return avg != null ? Math.round(avg) : ctoon.price
  }

  // 4) Shape for frontend
  const items = offers.map(o => {
    const ctoonsOffered = o.ctoons.filter(x => x.role === 'OFFERED').map(x => ({ ...x.userCtoon.ctoon, mintNumber: x.userCtoon.mintNumber, value: valueCtoon(x.userCtoon.ctoon) }))
    const ctoonsRequested = o.ctoons.filter(x => x.role === 'REQUESTED').map(x => ({ ...x.userCtoon.ctoon, mintNumber: x.userCtoon.mintNumber, value: valueCtoon(x.userCtoon.ctoon) }))

    // Decision timestamp is when status left PENDING. We use updatedAt.
    // COUNTERED is excluded: nobody decided anything, the offer was superseded
    // by a revised one, and reporting it as a decision made a negotiation look
    // like a wall of rejections.
    const decisionAt = (o.status !== 'PENDING' && o.status !== 'COUNTERED') ? o.updatedAt : null

    return {
      id: o.id,
      initiator: o.initiator,
      recipient: o.recipient,
      pointsOffered: o.pointsOffered,
      ctoonsOffered,
      ctoonsRequested,
      status: o.status,
      createdAt: o.createdAt,      // ISO UTC
      decisionAt,                  // ISO UTC or null
      counteredOfferId: o.counteredOfferId,   // the offer this one replaced
      counteredByOfferId: o.counteredBy?.id ?? null // the offer that replaced this one
    }
  })

  return { items, total, page, limit }
})
