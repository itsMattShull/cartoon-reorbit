// server/api/admin/auction-only/history.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)

  const rows = await prisma.auctionOnly.findMany({
    where: { startsAt: { gte: weekAgo, lte: now } },
    orderBy: { startsAt: 'desc' },
    include: {
      userCtoon: {
        select: {
          mintNumber: true,
          user: { select: { username: true } },
          ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
        }
      }
    }
  })

  if (!rows.length) return []

  // Direct correlation via the auctionOnlyId FK (set at activation time for
  // anything activated after that column shipped).
  const directAuctions = await prisma.auction.findMany({
    where: { auctionOnlyId: { in: rows.map(r => r.id) } },
    select: {
      id: true,
      auctionOnlyId: true,
      status: true,
      highestBidderId: true,
      winnerId: true,
      highestBid: true,
      _count: { select: { bids: true, autoBids: true } }
    }
  })
  const byAuctionOnlyId = new Map(directAuctions.map(a => [a.auctionOnlyId, a]))

  // Legacy fallback for rows activated before the FK existed: match on
  // userCtoonId + endAt (copied verbatim from AuctionOnly.endsAt at activation).
  const needLegacyMatch = rows.filter(r => r.isStarted && !byAuctionOnlyId.has(r.id))
  let legacyAuctions = []
  if (needLegacyMatch.length) {
    legacyAuctions = await prisma.auction.findMany({
      where: {
        auctionOnlyId: null,
        OR: needLegacyMatch.map(r => ({ userCtoonId: r.userCtoonId, endAt: r.endsAt }))
      },
      select: {
        id: true,
        userCtoonId: true,
        endAt: true,
        status: true,
        highestBidderId: true,
        winnerId: true,
        highestBid: true,
        _count: { select: { bids: true, autoBids: true } }
      }
    })
  }

  return rows.map(r => {
    let auction = byAuctionOnlyId.get(r.id) || null
    let ambiguous = false
    if (!auction && r.isStarted) {
      const matches = legacyAuctions.filter(
        a => a.userCtoonId === r.userCtoonId && a.endAt.getTime() === r.endsAt.getTime()
      )
      if (matches.length === 1) auction = matches[0]
      else if (matches.length > 1) ambiguous = true
    }

    const hasBids =
      !!auction && (auction._count.bids > 0 || auction._count.autoBids > 0 || !!auction.highestBidderId)

    let status
    let removable = true
    let blockedReason = null

    if (ambiguous) {
      status = 'unknown'
      removable = false
      blockedReason = 'Multiple matching Auction records found for this legacy listing; cannot safely identify which one to remove.'
    } else if (!auction) {
      status = r.isStarted ? 'live_untracked' : (r.startsAt <= now ? 'stuck' : 'pending')
    } else if (auction.status !== 'ACTIVE') {
      status = auction.status.toLowerCase()
      removable = false
      blockedReason = `Auction already ${auction.status.toLowerCase()}${auction.winnerId ? ' with a winner assigned' : ''}; has real transaction history.`
    } else if (hasBids) {
      status = 'live_with_bids'
      removable = false
      blockedReason = `Has ${auction._count.bids} bid(s) and ${auction._count.autoBids} max-bid setting(s) from real users.`
    } else {
      status = 'live_no_bids'
    }

    return {
      id: r.id,
      pricePoints: r.pricePoints,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      isFeatured: r.isFeatured,
      isStarted: r.isStarted,
      mintNumber: r.userCtoon?.mintNumber ?? null,
      ownerUsername: r.userCtoon?.user?.username || null,
      ctoon: r.userCtoon?.ctoon || null,
      auction: auction
        ? {
            id: auction.id,
            status: auction.status,
            bidCount: auction._count.bids,
            autoBidCount: auction._count.autoBids,
            highestBid: auction.highestBid,
            hasWinner: !!auction.winnerId
          }
        : null,
      status,
      removable,
      blockedReason
    }
  })
})
