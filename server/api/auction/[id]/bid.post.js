// server/api/auction/[id]/bid.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { prisma as db } from '@/server/prisma'
import { applyProxyAutoBids, incrementFor } from '@/server/utils/autoBid'

const ANTI_SNIPE_MS = 60_000

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

  // 3) Quick read
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

  let finalAuction = pre
  let autoSteps    = []
  let finalEndAt   = new Date(pre.endAt)
  let manualExtended = false

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

    const now  = new Date()
    const preEnd = new Date(fresh.endAt)
    if (preEnd <= now) throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })

    if (fresh.highestBidderId && fresh.highestBidderId === userId) {
      throw createError({ statusCode: 400, statusMessage: 'You are already the highest bidder' })
    }

    const noBidsYet   = !fresh.highestBidderId || (fresh.highestBid || 0) === 0
    const requiredBid = noBidsYet
      ? fresh.initialBet
      : (fresh.highestBid + incrementFor(fresh.highestBid))

    if (manualAmount !== requiredBid) {
      throw createError({ statusCode: 400, statusMessage: `Next bid must be exactly ${requiredBid}` })
    }

    const up = await tx.userPoints.findUnique({ where: { userId } })
    if (!up || up.points < manualAmount) {
      throw createError({ statusCode: 400, statusMessage: 'Insufficient points to place this bid' })
    }

    await tx.bid.create({ data: { auctionId, userId, amount: manualAmount } })
    await tx.auction.update({
      where: { id: auctionId },
      data: { highestBid: manualAmount, highestBidderId: userId }
    })

    const res = await applyProxyAutoBids(tx, auctionId, { antiSnipeMs: ANTI_SNIPE_MS })
    autoSteps    = res.steps || []
    finalAuction = res.finalAuction || (await tx.auction.findUnique({ where: { id: auctionId } }))

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

  // 5) Emit socket events (flush before disconnect + ISO endAt)
  const config = useRuntimeConfig()
  const url = process.env.NODE_ENV === 'production'
    ? undefined
    : `http://localhost:${config.public.socketPort}`

  const idsForNames = Array.from(new Set(autoSteps.map(s => s.userId)))
  const users = idsForNames.length
    ? await db.user.findMany({ where: { id: { in: idsForNames } }, select: { id: true, username: true } })
    : []
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Someone']))

  await new Promise((resolve) => {
    const socket = createSocket(url, { transports: ['websocket'] })
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

      // let packets flush before disconnecting
      setTimeout(finish, 25)
    })

    socket.on('connect_error', finish)
    setTimeout(finish, 1500) // fail-safe
  })

  return {
    ok: true,
    amount: manualAmount,
    highestBid: finalAuction?.highestBid ?? manualAmount,
    highestBidderId: finalAuction?.highestBidderId ?? userId,
    endAt: finalEndAt
  }
})
