// server/api/admin/auction-only/[id].delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAuctionOnlyError } from '@/server/utils/auctionOnlyErrorLog'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { cancelAuctionClose } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  try {
    return await handleRemove(event)
  } catch (err) {
    const statusCode = err?.statusCode || 500
    if (statusCode >= 500) {
      await logAuctionOnlyError('removal', err, event.context.params?.id || null)
    }
    throw err
  }
})

async function handleRemove(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const existing = await prisma.auctionOnly.findUnique({
    where: { id },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      isStarted: true,
      pricePoints: true,
      isFeatured: true,
      userCtoonId: true,
      userCtoon: {
        select: {
          id: true,
          userId: true,
          mintNumber: true,
          user: { select: { username: true } },
          ctoon: { select: { name: true } }
        }
      }
    }
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Auction not found' })

  // Correlate to a live/created Auction. Prefer the direct FK (set at activation
  // time); fall back to a heuristic match for legacy rows created before the
  // auctionOnlyId column existed, and refuse to guess if it's ambiguous.
  let auction = await prisma.auction.findUnique({
    where: { auctionOnlyId: id },
    select: {
      id: true,
      status: true,
      highestBidderId: true,
      winnerId: true,
      highestBid: true,
      _count: { select: { bids: true, autoBids: true } }
    }
  })

  if (!auction && existing.isStarted) {
    const candidates = await prisma.auction.findMany({
      where: { userCtoonId: existing.userCtoonId, endAt: existing.endsAt, auctionOnlyId: null },
      select: {
        id: true,
        status: true,
        highestBidderId: true,
        winnerId: true,
        highestBid: true,
        _count: { select: { bids: true, autoBids: true } }
      }
    })
    if (candidates.length > 1) {
      throw createError({
        statusCode: 409,
        statusMessage: `Cannot safely identify the resulting auction: found ${candidates.length} legacy Auction rows matching this listing's cToon and end time (ids: ${candidates.map(c => c.id).join(', ')}). Resolve manually before removing.`
      })
    }
    auction = candidates[0] || null
  }

  // Decide whether removal is safe. Real transaction history (bids, autobids,
  // a closed/cancelled status) blocks removal — the admin must resolve those
  // manually first rather than silently destroying paid-for state.
  if (auction) {
    const hasBids = auction._count.bids > 0 || auction._count.autoBids > 0 || !!auction.highestBidderId
    if (auction.status !== 'ACTIVE') {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot remove: the resulting auction (id ${auction.id}) is already ${auction.status.toLowerCase()}${auction.winnerId ? ' with a winner assigned' : ''}. This listing has real transaction history and must be handled manually.`
      })
    }
    if (hasBids) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot remove: the resulting auction (id ${auction.id}) has ${auction._count.bids} bid(s) and ${auction._count.autoBids} max-bid setting(s) from real users (highest bid ${auction.highestBid} pts). Resolve/refund those manually before deleting.`
      })
    }

    // Safe to touch the Auction — but not if its BullMQ auto-close job is
    // actively being processed right now.
    const jobState = await cancelAuctionClose(auction.id)
    if (jobState.active) {
      throw createError({ statusCode: 409, statusMessage: 'The auction-close job for this listing is currently processing. Try again in a moment.' })
    }
  }

  const snapshot = {
    ctoonName: existing.userCtoon?.ctoon?.name || null,
    mintNumber: existing.userCtoon?.mintNumber ?? null,
    pricePoints: existing.pricePoints,
    startsAt: existing.startsAt,
    endsAt: existing.endsAt,
    isFeatured: existing.isFeatured,
    isStarted: existing.isStarted,
    hadAuction: !!auction,
    auctionId: auction?.id || null,
    auctionStatus: auction?.status || null
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (auction) {
        await tx.auctionAutoBid.deleteMany({ where: { auctionId: auction.id } })
        await tx.bid.deleteMany({ where: { auctionId: auction.id } })
        const delAuction = await tx.auction.deleteMany({ where: { id: auction.id, status: 'ACTIVE' } })
        if (delAuction.count !== 1) {
          throw createError({ statusCode: 409, statusMessage: 'Auction changed concurrently (e.g. a bid just landed or it closed). Refresh and try again.' })
        }
        await tx.userCtoon.updateMany({ where: { id: existing.userCtoonId }, data: { isTradeable: true } })
      }

      const delAuctionOnly = await tx.auctionOnly.deleteMany({ where: { id, isStarted: existing.isStarted } })
      if (delAuctionOnly.count !== 1) {
        throw createError({ statusCode: 409, statusMessage: 'This listing changed concurrently (e.g. it just went live). Refresh and try again.' })
      }
    })
  } catch (err) {
    if (err?.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: `Removal failed: ${err?.message || String(err)}` })
  }

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'AuctionOnly',
    key: 'delete',
    prevValue: snapshot,
    newValue: null,
    targetUserId: existing.userCtoon?.userId || null,
    targetUsername: existing.userCtoon?.user?.username || null
  })

  return { ok: true }
}
