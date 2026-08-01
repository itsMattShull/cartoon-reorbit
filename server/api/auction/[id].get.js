import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { encodeUserCtoonId } from '@/server/utils/userCtoonId'
import { findConcurrentFeaturedLead } from '@/server/utils/featuredEligibility'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { id } = event.context.params
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing auction ID' })

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      userCtoon: { include: { ctoon: true } },
      winner: { select: { username: true } },
      highestBidder: { select: { username: true } }
    }
  })
  if (!auction) throw createError({ statusCode: 404, statusMessage: 'Auction not found' })

  // Holiday flag for this cToon
  const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
    where: { ctoonId: auction.userCtoon.ctoonId },
    select: { id: true }
  }))

  const bids = await prisma.bid.findMany({
    where: { auctionId: id },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: 'desc' }
  })

  const currentBid = bids.length > 0
    ? Math.max(...bids.map((b) => b.amount))
    : auction.initialBet

  // Featured auctions: a user can't hold the lead on more than one active
  // featured auction for the same cToon (1st/2nd edition combined) at a time.
  let blockedByFeaturedLead = false
  if (auction.isFeatured) {
    const conflict = await findConcurrentFeaturedLead(prisma, userId, {
      excludeAuctionId: auction.id,
      ctoon: {
        ctoonId: auction.userCtoon.ctoonId,
        isSecondEdition: auction.userCtoon.ctoon.isSecondEdition,
        relatedFirstEditionId: auction.userCtoon.ctoon.relatedFirstEditionId
      }
    })
    blockedByFeaturedLead = !!conflict
  }

  // Closed with nobody bidding: the cToon never left its owner, so whoever holds
  // it now can put it straight back up. Deliberately keyed on current ownership
  // rather than auction.creatorId — an unsold cToon becomes tradeable again and
  // may have changed hands since it closed.
  let canRelist = false
  if (auction.status === 'CLOSED' &&
      auction.winnerId === null &&
      auction.userCtoon.userId === userId &&
      !auction.userCtoon.burnedAt) {
    const blocking = await prisma.auction.findFirst({
      where: { userCtoonId: auction.userCtoonId, status: 'ACTIVE' },
      select: { id: true }
    })
    canRelist = !blocking
  }

  return {
    id: auction.id,
    isFeatured: auction.isFeatured,
    blockedByFeaturedLead,
    ctoon: {
      id:         auction.userCtoon.ctoonId,
      userCtoonId: encodeUserCtoonId(auction.userCtoon.userId, auction.userCtoon.ctoonId, auction.userCtoon.mintNumber),
      assetPath:  auction.userCtoon.ctoon.assetPath,
      name:       auction.userCtoon.ctoon.name,
      series:     auction.userCtoon.ctoon.series,
      rarity:     auction.userCtoon.ctoon.rarity,
      isGtoon:    auction.userCtoon.ctoon.isGtoon,
      cost:       auction.userCtoon.ctoon.cost,
      power:      auction.userCtoon.ctoon.power,
      mintNumber: auction.userCtoon.mintNumber,
      isSecondEdition: auction.userCtoon.ctoon.isSecondEdition,
      secondEditionOverlayX: auction.userCtoon.ctoon.secondEditionOverlayX,
      secondEditionOverlayY: auction.userCtoon.ctoon.secondEditionOverlayY,
      secondEditionOverlaySize: auction.userCtoon.ctoon.secondEditionOverlaySize
    },
    isHolidayItem, // ← added
    createdAt:  auction.createdAt.toISOString(),
    endAt:      auction.endAt.toISOString(),
    initialBet: auction.initialBet,
    duration:   auction.duration,
    status:     auction.status,
    bidCount:   bids.length,
    canRelist,
    highestBid: auction.highestBid ?? currentBid,
    highestBidderUsername: auction.highestBidder?.username || null,
    bids: bids.map(b => ({ user: b.user.username, amount: b.amount })),
    winnerUsername: auction.winner?.username || null
  }
})
