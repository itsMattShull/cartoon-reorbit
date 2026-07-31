// server/api/ctoon/[id]/getRecentAuctions.get.js

import { defineEventHandler, createError, getRequestHeader, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { resolveUserCtoonId } from '@/server/utils/userCtoonId'
import {
  computePriceSuggestion,
  isSystemSale,
  RECENT_WINDOW_DAYS,
  MAX_SAMPLE_SIZE
} from '@/server/utils/auctionPriceSuggestion'
import { getSystemUserIds } from '@/server/utils/systemAccounts'

// How many sale rows to show in the "Recent Sales" list.
const DISPLAY_COUNT = 3

// Read a few extra rows so that dropping system-account sales still leaves a
// full sample to work with.
const FETCH_COUNT = MAX_SAMPLE_SIZE * 2

const SALE_SELECT = {
  endAt: true,
  highestBid: true,
  initialBet: true,
  winnerId: true,
  userCtoon: { select: { mintNumber: true } }
}

function toDisplay(sale) {
  return { endedAt: sale.endAt, soldFor: sale.highestBid }
}

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) {
    throw createError({ statusCode: 422, statusMessage: 'Missing cToon ID' })
  }

  // Require auth
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
  const wantSuggestion = ['1', 'true', 'yes'].includes(
    String(Array.isArray(query.suggest) ? query.suggest[0] : query.suggest ?? '').toLowerCase()
  )

  const soldWhere = {
    userCtoon: { ctoonId: id },
    status: 'CLOSED',
    winnerId: { not: null }
  }

  // Callers that only want the display list (the legacy Add-to-Auction modal)
  // get exactly the response shape they always had.
  if (!wantSuggestion) {
    const recent = await prisma.auction.findMany({
      where: soldWhere,
      orderBy: { endAt: 'desc' },
      take: DISPLAY_COUNT,
      select: { endAt: true, highestBid: true }
    })
    return recent.map(toDisplay)
  }

  // The window is a server constant on purpose — a caller-supplied cutoff would
  // let anyone hand-pick the sales the suggestion is built from.
  const cutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [recentRows, ctoonRec, highestMintRow, systemUserIds, holidayRec] = await Promise.all([
    prisma.auction.findMany({
      where: { ...soldWhere, endAt: { gte: cutoff } },
      orderBy: { endAt: 'desc' },
      take: FETCH_COUNT,
      select: SALE_SELECT
    }),
    prisma.ctoon.findUnique({
      where: { id },
      select: { price: true, rarity: true, quantity: true, inCmart: true }
    }),
    // Cheaper than a groupBy: an index-only backward scan on the
    // UserCtoon @@unique([ctoonId, mintNumber]) index.
    prisma.userCtoon.findFirst({
      where: { ctoonId: id },
      orderBy: { mintNumber: 'desc' },
      select: { mintNumber: true }
    }),
    getSystemUserIds(),
    prisma.holidayEventItem.findFirst({ where: { ctoonId: id }, select: { id: true } })
  ])

  if (!ctoonRec) {
    throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
  }

  const dropSystemSales = rows => rows.filter(r => !isSystemSale(r, systemUserIds))

  let sales = dropSystemSales(recentRows).slice(0, MAX_SAMPLE_SIZE)
  let basis = 'recent'

  // Nothing recent — reach further back before giving up on sale data.
  if (!sales.length) {
    const allTimeRows = await prisma.auction.findMany({
      where: soldWhere,
      orderBy: { endAt: 'desc' },
      take: FETCH_COUNT,
      select: SALE_SELECT
    })
    sales = dropSystemSales(allTimeRows).slice(0, MAX_SAMPLE_SIZE)
    if (sales.length) basis = 'alltime'
  }

  // Mint context, only if the caller actually owns the cToon they named. The
  // encoded id is unsigned and forgeable, so an unverified one would let anyone
  // probe whether a given (user, cToon, mint) exists.
  let mintNumber = null
  const rawUserCtoonId = Array.isArray(query.userCtoonId) ? query.userCtoonId[0] : query.userCtoonId
  if (rawUserCtoonId) {
    const resolvedId = await resolveUserCtoonId(String(rawUserCtoonId))
    if (resolvedId) {
      const owned = await prisma.userCtoon.findUnique({
        where: { id: resolvedId },
        select: { userId: true, ctoonId: true, mintNumber: true, burnedAt: true }
      })
      if (owned && owned.userId === me.id && owned.ctoonId === id && !owned.burnedAt) {
        mintNumber = owned.mintNumber
      }
    }
  }

  const suggestion = computePriceSuggestion({
    sales: sales.map(s => ({
      highestBid: s.highestBid,
      mintNumber: s.userCtoon?.mintNumber ?? null
    })),
    cMartPrice: ctoonRec.inCmart ? ctoonRec.price : null,
    mintNumber,
    highestMint: highestMintRow?.mintNumber ?? null,
    isUnlimited: ctoonRec.quantity == null,
    isHolidayItem: !!holidayRec,
    rarity: ctoonRec.rarity,
    basis
  })

  return {
    sales: sales.slice(0, DISPLAY_COUNT).map(toDisplay),
    suggestion
  }
})
