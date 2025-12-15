// server/api/auction/[id]/bid.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { prisma as db } from '@/server/prisma'
import { applyProxyAutoBids, incrementFor } from '@/server/utils/autoBid'

const ANTI_SNIPE_MS = 60_000
const THIRTY_DAYS_MS  = 30 * 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const fmt = (n) => Number(n || 0).toLocaleString('en-US')
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
  let outbidUserIds = []   // collect previous leaders (if any)
  if (!Number.isFinite(manualAmount) || manualAmount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid bid amount' })
  }

  // 3) Quick read
  const pre = await db.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true, status: true, endAt: true,
      highestBid: true, highestBidderId: true, initialBet: true,
      creatorId: true
    }
  })
  if (!pre || pre.status !== 'ACTIVE') {
    throw createError({ statusCode: 400, statusMessage: 'Auction not active' })
  }
  if (new Date(pre.endAt) <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })
  }
  if (pre.creatorId && pre.creatorId === userId) {
    throw createError({ statusCode: 403, statusMessage: 'Creators cannot bid on their own auctions' })
  }

  let finalAuction = pre
  let autoSteps    = []
  let finalEndAt   = new Date(pre.endAt)
  let manualExtended = false

  // 4) Transaction
  await db.$transaction(async (tx) => {
    const fresh = await tx.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        status: true,
        endAt: true,
        highestBid: true,
        highestBidderId: true,
        initialBet: true,
        creatorId: true,
        isFeatured: true,
        userCtoon: {
          select: {
            ctoonId: true,
            // mintNumber: true, // add this if you ever need it
          }
        }
      }
    })
    if (!fresh || fresh.status !== 'ACTIVE') {
      throw createError({ statusCode: 400, statusMessage: 'Auction not active' })
    }

    // enforce inside the txn to avoid race conditions
    if (fresh.creatorId && fresh.creatorId === userId) {
      throw createError({ statusCode: 403, statusMessage: 'Creators cannot bid on their own auctions' })
    }

    // Featured-auction eligibility: block if user currently owns >=2 of this cToon
    // OR has owned >=2 in the last 30 days (distinct userCtoonIds in owner logs)
    if (fresh.isFeatured && fresh.userCtoon?.ctoonId) {
      // 1) Current ownership count (unburned)
      const currentOwned = await tx.userCtoon.count({
        where: {
          userId,
          ctoonId: fresh.userCtoon.ctoonId,
          burnedAt: null,
        }
      })
      if (currentOwned >= 2) {
        throw createError({
          statusCode: 403,
          statusMessage: 'You are not eligible to bid on this featured auction',
        })
      }

      // 2) Ownership in last 30 days (distinct items)
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
      if (recentOwnerships.length >= 2) {
        throw createError({
          statusCode: 403,
          statusMessage: 'You are not eligible to bid on this featured auction',
        })
      }
    }

    const now  = new Date()
    const preEnd = new Date(fresh.endAt)
    if (preEnd <= now) throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })

    if (fresh.highestBidderId && fresh.highestBidderId === userId) {
      throw createError({ statusCode: 400, statusMessage: 'You are already the highest bidder' })
    }

    const prevLeaderId = fresh.highestBidderId || null
    const noBidsYet   = !fresh.highestBidderId || (fresh.highestBid || 0) === 0
    const requiredBid = noBidsYet
      ? fresh.initialBet
      : (fresh.highestBid + incrementFor(fresh.highestBid))

    if (manualAmount !== requiredBid) {
      throw createError({ statusCode: 400, statusMessage: `Next bid must be exactly ${requiredBid}` })
    }

    // Compute available points = total points - active locked points
    const up = await tx.userPoints.findUnique({ where: { userId } })
    const activeLocks = await tx.lockedPoints.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { amount: true }
    })
    const lockedSum = activeLocks.reduce((acc, r) => acc + (r.amount || 0), 0)
    const totalPts  = up?.points || 0
    const available = totalPts - lockedSum
    if (available < manualAmount) {
      throw createError({
        statusCode: 400,
        statusMessage: `Insufficient points: you have ${fmt(totalPts)} points, with ${fmt(lockedSum)} locked.`
      })
    }

    await tx.bid.create({ data: { auctionId, userId, amount: manualAmount } })
    await tx.auction.update({
      where: { id: auctionId },
      data: { highestBid: manualAmount, highestBidderId: userId }
    })

    // Lock the bid amount for this auction (will be released if outbid by autobid)
    await tx.lockedPoints.create({
      data: {
        userId,
        amount: manualAmount,
        reason: 'AUCTION_BID',
        status: 'ACTIVE',
        contextType: 'AUCTION',
        contextId: auctionId
      }
    })

    // Release previous leader’s locks for this auction (they’ve just been outbid)
    if (prevLeaderId) {
      const prevActive = await tx.lockedPoints.findMany({
        where: {
          userId: prevLeaderId,
          status: 'ACTIVE',
          contextType: 'AUCTION',
          contextId: auctionId
        },
        select: { id: true }
      })
      if (prevActive.length) {
        await tx.lockedPoints.updateMany({
          where: { id: { in: prevActive.map(r => r.id) } },
          data: { status: 'RELEASED' }
        })
      }
    }

    const res = await applyProxyAutoBids(tx, auctionId, { antiSnipeMs: ANTI_SNIPE_MS })
    autoSteps    = res.steps || []
    finalAuction = res.finalAuction || (await tx.auction.findUnique({ where: { id: auctionId } }))
    if (prevLeaderId && finalAuction?.highestBidderId && prevLeaderId !== finalAuction.highestBidderId) {
      outbidUserIds.push(prevLeaderId)
    }
    if (Array.isArray(res.outbids) && res.outbids.length) {
      outbidUserIds.push(...res.outbids)
    }

    if (!autoSteps.length) {
      const msLeft = preEnd.getTime() - Date.now()
      if (msLeft <= ANTI_SNIPE_MS) {
        const extended = new Date(Date.now() + ANTI_SNIPE_MS)
        await tx.auction.update({ where: { id: auctionId }, data: { endAt: extended } })
        finalAuction = { ...finalAuction, endAt: extended }
        finalEndAt = extended
        manualExtended = true
      } else {
        finalEndAt = preEnd
      }
    } else {
      finalEndAt = new Date(finalAuction.endAt)
    }
  })

  // 5) Emit socket events
  const url = useRuntimeConfig().socketOrigin

  const idsForNames = Array.from(new Set(autoSteps.map(s => s.userId)))
  const users = idsForNames.length
    ? await db.user.findMany({ where: { id: { in: idsForNames } }, select: { id: true, username: true } })
    : []
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Someone']))

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

    socket.on('connect', async () => {
      socket.emit('new-bid', {
        auctionId,
        user: me.username || 'Someone',
        amount: manualAmount,
        ...(manualExtended ? { endAt: new Date(finalEndAt).toISOString() } : {})
      })

      for (const s of autoSteps) {
        socket.emit('new-bid', {
          auctionId,
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

  // 6) Notify only the latest outbid leader via Discord DM (non-blocking)
  try {
    const { notifyOutbidByUserId } = await import('@/server/utils/discord')
    const final = await db.auction.findUnique({
      where: { id: auctionId },
      select: { highestBidderId: true }
    })

    // Reconstruct the last leadership change from the auto-bid steps.
    // Leader at start of auto-bidding is the manual bidder.
    let leader = userId
    let lastOutbid = null
    for (let i = 0; i < autoSteps.length; i++) {
      const step = autoSteps[i]
      if (step.userId !== leader) {
        const next = autoSteps[i + 1]
        const leaderDefended = next && next.userId === leader
        if (leaderDefended) {
          i++ // skip the leader's auto-raise step
        } else {
          if (leader) lastOutbid = leader
          leader = step.userId
        }
      }
    }

    // If no auto-bid leadership change occurred, the manual bid outbid the previous leader
    if (!lastOutbid && pre?.highestBidderId && pre.highestBidderId !== final?.highestBidderId) {
      lastOutbid = pre.highestBidderId
    }

    if (lastOutbid && lastOutbid !== final?.highestBidderId) {
      await notifyOutbidByUserId(db, lastOutbid, auctionId)
    }
  } catch { /* ignore DM failures */ }

  return {
    ok: true,
    amount: manualAmount,
    highestBid: finalAuction?.highestBid ?? manualAmount,
    highestBidderId: finalAuction?.highestBidderId ?? userId,
    endAt: finalEndAt
  }
})
