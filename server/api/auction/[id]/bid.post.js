// server/api/auction/[id]/bid.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { prisma as db } from '@/server/prisma'
import { applyProxyAutoBids, incrementFor } from '@/server/utils/autoBid'

const SNIPE_WINDOW_MS = 60_000   // extend only if bid occurs with <= 60s left
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
  const { amount } = await readBody(event)

  if (!Number.isFinite(Number(amount))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid bid amount' })
  }

  // 3) Quick pre-checks (non-final; we’ll re-validate in the transaction)
  const auc0 = await db.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, status: true, endAt: true, highestBid: true, highestBidderId: true }
  })
  if (!auc0 || auc0.status !== 'ACTIVE') {
    throw createError({ statusCode: 400, statusMessage: 'Auction not active' })
  }
  if (new Date(auc0.endAt) <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })
  }

  // 4) Main transaction: write manual bid, run proxy auto-bids, maybe extend endAt
  let finalEndAt   = new Date(auc0.endAt)
  let finalAuction = auc0
  let autoSteps    = []   // [{ userId, amount }]
  const manualAmount = Math.floor(Number(amount))

  await db.$transaction(async (tx) => {
    // 4a) Re-read fresh within tx to avoid race conditions
    const fresh = await tx.auction.findUnique({
      where: { id: auctionId },
      select: { id: true, status: true, endAt: true, highestBid: true, highestBidderId: true }
    })
    if (!fresh || fresh.status !== 'ACTIVE') {
      throw createError({ statusCode: 400, statusMessage: 'Auction not active' })
    }

    const now    = new Date()
    const preEnd = new Date(fresh.endAt)
    if (preEnd <= now) {
      throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })
    }

    // Block the current top bidder from bidding again
    if (fresh.highestBidderId && fresh.highestBidderId === userId) {
      throw createError({ statusCode: 400, statusMessage: 'You are already the highest bidder' })
    }

    // Enforce increment schedule against the current price
    const requiredInc   = incrementFor(fresh.highestBid || 0)
    const requiredBid   = (fresh.highestBid || 0) + requiredInc
    if (manualAmount !== requiredBid) {
      throw createError({
        statusCode: 400,
        statusMessage: `Next bid must be exactly ${requiredBid}`
      })
    }

    // Ensure user has enough points for the bid (balance check at bid time)
    const up = await tx.userPoints.findUnique({ where: { userId } })
    if (!up || up.points < manualAmount) {
      throw createError({ statusCode: 400, statusMessage: 'Insufficient points to place this bid' })
    }

    // 4b) Create the manual bid
    await tx.bid.create({
      data: { auctionId, userId, amount: manualAmount }
    })

    // Update auction leader/price to this manual bid first
    await tx.auction.update({
      where: { id: auctionId },
      data: {
        highestBid: manualAmount,
        highestBidderId: userId
      }
    })

    // 4c) Run proxy auto-bids to settle at the correct final price/leader
    const res = await applyProxyAutoBids(tx, auctionId)
    autoSteps = res.steps || []
    finalAuction = res.finalAuction || (await tx.auction.findUnique({ where: { id: auctionId } }))

    // 4d) Snipe extension:
    // Extend only if (preEnd - now) <= 60s, and at least one bid happened (manual always counts)
    const didAnyBid = true || autoSteps.length > 0  // manual bid definitely happened
    const withinWindow = (preEnd.getTime() - Date.now()) <= SNIPE_WINDOW_MS
    if (didAnyBid && withinWindow) {
      finalEndAt = new Date(preEnd.getTime() + SNIPE_EXTEND_MS)
      await tx.auction.update({
        where: { id: auctionId },
        data: { endAt: finalEndAt }
      })
    } else {
      finalEndAt = preEnd
    }
  })

  // 5) Emit socket events: manual bid first, then each auto step.
  //    Only the LAST emit carries endAt so the UI updates once.
  const config = useRuntimeConfig()
  const url = process.env.NODE_ENV === 'production'
    ? undefined
    : `http://localhost:${config.public.socketPort}`

  // Pre-fetch names for auto-step users (manual step uses me.username)
  const idsForNames = Array.from(new Set(autoSteps.map(s => s.userId)))
  const users = idsForNames.length
    ? await db.user.findMany({ where: { id: { in: idsForNames } }, select: { id: true, username: true } })
    : []
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Someone']))

  await new Promise((resolve) => {
    const socket = createSocket(url, { transports: ['websocket'] })
    socket.on('connect', async () => {
      // manual step
      const hasAuto = autoSteps.length > 0
      // If there are NO auto steps and we extended, put endAt on this manual emit.
      socket.emit('new-bid', {
        auctionId,
        user: me.username || 'Someone',
        amount: manualAmount,
        ...(hasAuto ? {} : { endAt: finalEndAt })
      })

      // auto steps (only last one includes endAt)
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
    // Fallback resolve so API doesn’t hang if socket can’t connect (dev)
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
