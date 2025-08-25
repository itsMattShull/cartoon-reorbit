// server/api/auction/[id]/bid.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { prisma as db } from '@/server/prisma'
import { applyProxyAutoBids, incrementFor } from '@/server/utils/autoBid'

const SNIPE_WINDOW_MS = 60_000   // extend only if bid occurs with ≤ 60s left
const SNIPE_EXTEND_MS = 30_000   // extend by +30s FROM CURRENT endAt

export default defineEventHandler(async (event) => {
  // 1) Auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // 2) Parse
  const { id } = event.context.params
  const auctionId = String(id)
  const body = await readBody(event)
  const manualAmount = Math.floor(Number(body?.amount))
  if (!Number.isFinite(manualAmount) || manualAmount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid bid amount' })
  }

  // 3) Quick read (non-final)
  const pre = await db.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true, status: true, endAt: true,
      highestBid: true, highestBidderId: true, initialBet: true
    }
  })
  if (!pre || pre.status !== 'ACTIVE') {
    throw createError({ statusCode: 400, statusMessage: 'Auction not active' })
  }
  if (new Date(pre.endAt) <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })
  }

  let finalEndAt   = new Date(pre.endAt)
  let finalAuction = pre
  let autoSteps    = []

  // 4) Transaction
  await db.$transaction(async (tx) => {
    const fresh = await tx.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true, status: true, endAt: true,
        highestBid: true, highestBidderId: true, initialBet: true
      }
    })
    if (!fresh || fresh.status !== 'ACTIVE') {
      throw createError({ statusCode: 400, statusMessage: 'Auction not active' })
    }

    const now    = new Date()
    const preEnd = new Date(fresh.endAt)
    if (preEnd <= now) throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })

    // If you're already on top, you can't bid again
    if (fresh.highestBidderId && fresh.highestBidderId === userId) {
      throw createError({ statusCode: 400, statusMessage: 'You are already the highest bidder' })
    }

    // REQUIRED amount:
    // - If no bids yet, first bid must be exactly initialBet
    // - Otherwise, exactly highestBid + incrementFor(highestBid)
    const noBidsYet   = !fresh.highestBidderId || (fresh.highestBid || 0) === 0
    const requiredBid = noBidsYet
      ? fresh.initialBet
      : (fresh.highestBid + incrementFor(fresh.highestBid))

    if (manualAmount !== requiredBid) {
      throw createError({
        statusCode: 400,
        statusMessage: `Next bid must be exactly ${requiredBid}`
      })
    }

    // Ensure user has enough points
    const up = await tx.userPoints.findUnique({ where: { userId } })
    if (!up || up.points < manualAmount) {
      throw createError({ statusCode: 400, statusMessage: 'Insufficient points to place this bid' })
    }

    // Create manual bid
    await tx.bid.create({
      data: { auctionId, userId, amount: manualAmount }
    })

    // Update current leader/price from this manual step
    await tx.auction.update({
      where: { id: auctionId },
      data: {
        highestBid: manualAmount,
        highestBidderId: userId
      }
    })

    // Run proxy auto-bids to settle true final price/leader
    const res = await applyProxyAutoBids(tx, auctionId)
    autoSteps = res.steps || []
    finalAuction = res.finalAuction || (await tx.auction.findUnique({ where: { id: auctionId } }))

    // Anti-snipe: extend only if this bid (manual + any auto) occurs ≤60s before end.
    const withinWindow = (preEnd.getTime() - Date.now()) <= SNIPE_WINDOW_MS
    if (withinWindow) {
      finalEndAt = new Date(preEnd.getTime() + SNIPE_EXTEND_MS)
      await tx.auction.update({
        where: { id: auctionId },
        data: { endAt: finalEndAt }
      })
    } else {
      finalEndAt = preEnd
    }
  })

  // 5) Emit socket events
  const config = useRuntimeConfig()
  const url = process.env.NODE_ENV === 'production'
    ? undefined
    : `http://localhost:${config.public.socketPort}`

  // Preload names for auto steps
  const idsForNames = Array.from(new Set(autoSteps.map(s => s.userId)))
  const users = idsForNames.length
    ? await db.user.findMany({ where: { id: { in: idsForNames } }, select: { id: true, username: true } })
    : []
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Someone']))

  await new Promise((resolve) => {
    const socket = createSocket(url, { transports: ['websocket'] })
    socket.on('connect', async () => {
      const hasAuto = autoSteps.length > 0
      // Manual step
      socket.emit('new-bid', {
        auctionId,
        user: me.username || 'Someone',
        amount: manualAmount,
        ...(hasAuto ? {} : { endAt: finalEndAt })
      })
      // Auto steps (only last carries endAt)
      for (let i = 0; i < autoSteps.length; i++) {
        const s = autoSteps[i]
        const isLast = i === autoSteps.length - 1
        socket.emit('new-bid', {
          auctionId,
          user: nameById[s.userId] || 'Someone',
          amount: s.amount,
          ...(isLast ? { endAt: finalEndAt } : {})
        })
      }
      socket.disconnect()
      resolve()
    })
    setTimeout(() => resolve(), 1500)
  })

  return {
    ok: true,
    amount: manualAmount,
    highestBid: finalAuction?.highestBid ?? manualAmount,
    highestBidderId: finalAuction?.highestBidderId ?? userId,
    endAt: finalEndAt
  }
})
