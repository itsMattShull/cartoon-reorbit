// server/api/auction/[id]/autobid.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { prisma as db } from '@/server/prisma'
import { applyProxyAutoBids } from '@/server/utils/autoBid'

const ANTI_SNIPE_MS = 60_000
const THIRTY_DAYS_MS  = 30 * 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  // --- Auth ---
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // --- Parse ---
  const { id } = event.context.params
  const auctionId = String(id)
  const { maxAmount } = await readBody(event)

  const maxCap = Math.floor(Number(maxAmount))
  if (!Number.isFinite(maxCap) || maxCap <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid max auto bid amount' })
  }

  // --- Load auction & basic guards ---
  const auc = await db.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true, status: true, endAt: true,
      highestBid: true, highestBidderId: true, initialBet: true,
      creatorId: true
    }
  })
  if (!auc || auc.status !== 'ACTIVE') {
    throw createError({ statusCode: 400, statusMessage: 'Auction not active' })
  }
  if (new Date(auc.endAt) <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })
  }
  if (auc.creatorId && auc.creatorId === userId) {
    throw createError({ statusCode: 403, statusMessage: 'Creators cannot set auto-bids on their own auctions' })
  }

  // --- Prevent duplicate max auto-bids (other users) for this auction ---
  // We only consider active auto-bids. Allow same user to re-set same amount.
  const conflict = await db.auctionAutoBid.findFirst({
    where: {
      auctionId,
      maxAmount: maxCap,
      isActive: true,
      NOT: { userId }
    },
    select: { id: true }
  })
  if (conflict) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Another player already has this max auto-bid for this auction'
    })
  }

  // --- Upsert user's auto-bid ---
  await db.auctionAutoBid.upsert({
    where: { auctionId_userId: { auctionId, userId } },
    create: { auctionId, userId, maxAmount: maxCap, isActive: true },
    update: { maxAmount: maxCap, isActive: true }
  })

  // --- Run proxy auto-bids ---
  let steps = []
  let finalAuction = auc
  let outbidUserIds = []

  await db.$transaction(async (tx) => {
    const fresh = await tx.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true, status: true, endAt: true,
        highestBid: true, highestBidderId: true, initialBet: true,
        creatorId: true
      }
    })
    if (!fresh || fresh.status !== 'ACTIVE') return
    if (new Date(fresh.endAt) <= new Date()) return

    // Re-enforce creator guard inside txn
    if (fresh.creatorId && fresh.creatorId === userId) {
      throw createError({ statusCode: 403, statusMessage: 'Creators cannot set auto-bids on their own auctions' })
    }

    // Featured-auction eligibility: user must not have owned >1 of this cToon in last 30 days
    if (fresh.isFeatured && fresh.userCtoon?.ctoonId) {
      const cutoff = new Date(Date.now() - THIRTY_DAYS_MS)

      const recentOwnerships = await tx.ctoonOwnerLog.findMany({
        where: {
          userId,
          ctoonId: fresh.userCtoon.ctoonId,
          createdAt: { gte: cutoff },
        },
        select: { userCtoonId: true },
        distinct: ['userCtoonId'],
      })

      if (recentOwnerships.length > 1) {
        throw createError({
          statusCode: 403,
          statusMessage: 'You are not eligible to bid on this featured auction',
        })
      }
    }

    // Re-check duplicate constraint inside txn to avoid races
    const dup = await tx.auctionAutoBid.findFirst({
      where: {
        auctionId,
        maxAmount: maxCap,
        isActive: true,
        NOT: { userId }
      },
      select: { id: true }
    })
    if (dup) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Another player already has this max auto-bid for this auction'
      })
    }

    const res = await applyProxyAutoBids(tx, auctionId, { antiSnipeMs: ANTI_SNIPE_MS })
    steps = res.steps || []
    finalAuction = res.finalAuction || fresh
    if (Array.isArray(res.outbids) && res.outbids.length) {
      outbidUserIds.push(...res.outbids)
    }
  })

  if (!steps.length) {
    return {
      ok: true,
      changed: false,
      steps: 0,
      highestBid: finalAuction?.highestBid ?? null,
      highestBidderId: finalAuction?.highestBidderId ?? null,
      endAt: finalAuction?.endAt ?? null
    }
  }

  // --- Build username map ---
  const uniqueIds = Array.from(new Set(steps.map(s => s.userId)))
  const users = await db.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, username: true }
  })
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Someone']))

  // --- Emit socket events (flush before disconnect) ---
  const url = useRuntimeConfig().socketOrigin

  await new Promise((resolve) => {
    const socket = createSocket(url, {
      path: useRuntimeConfig().socketPath,
      transports: ['websocket', 'polling']
    })
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      try { socket.disconnect() } catch {}
      resolve()
    }

    socket.on('connect', () => {
      for (const s of steps) {
        socket.emit('new-bid', {
          auctionId: String(auctionId),
          user: nameById[s.userId] || 'Someone',
          amount: s.amount,
          ...(s.extendedEndAt ? { endAt: new Date(s.extendedEndAt).toISOString() } : {})
        })
      }
      setTimeout(finish, 25)
    })

    socket.on('connect_error', finish)
    setTimeout(finish, 1500)
  })

  // Notify outbid users (unique) post-commit
  try {
    const { notifyOutbidByUserId } = await import('@/server/utils/discord')
    // Remove current leader
    const final = await db.auction.findUnique({
      where: { id: auctionId },
      select: { highestBidderId: true }
    })
    const unique = Array.from(new Set(outbidUserIds.filter(Boolean)))
      .filter(uid => uid !== final?.highestBidderId)
 
    if (unique.length) {
      // Keep only users who actually have a Bid on this auction
      const bidders = await db.bid.findMany({
        where: { auctionId, userId: { in: unique } },
        select: { userId: true }
      })
      const eligible = Array.from(new Set(bidders.map(b => b.userId)))
      if (eligible.length) {
        await Promise.all(eligible.map(uid => notifyOutbidByUserId(db, uid, auctionId)))
      }
    }
  } catch { /* ignore failures */ }

  return {
    ok: true,
    changed: true,
    steps: steps.length,
    highestBid: finalAuction?.highestBid ?? null,
    highestBidderId: finalAuction?.highestBidderId ?? null,
    endAt: finalAuction?.endAt ?? null
  }
})
