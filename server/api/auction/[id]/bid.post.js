// server/api/auction/[id]/bid.post.js
import { PrismaClient } from '@prisma/client'
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // 1. Authenticate user
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse auction ID from URL and bid amount from body
  const { id } = event.context.params   // ← make sure we grab `id` here!
  const { amount } = await readBody(event)
  if (!id || typeof amount !== 'number') {
    throw createError({ statusCode: 422, statusMessage: 'Missing auction ID or bid amount' })
  }

  // 3. Fetch auction and validate status
  const auction = await prisma.auction.findUnique({ where: { id } })
  if (!auction || auction.status !== 'ACTIVE') {
    throw createError({ statusCode: 400, statusMessage: 'Auction not active or not found' })
  }
  if (new Date(auction.endAt) <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Auction has already ended' })
  }

  // 4. Determine current highest bid
  const highest = await prisma.bid.findFirst({
    where: { auctionId: id },
    orderBy: { amount: 'desc' }
  })
  const currentBid = highest ? highest.amount : auction.initialBet

  // 5. Validate new bid is higher
  if (amount <= currentBid) {
    throw createError({ statusCode: 400, statusMessage: 'Bid must be higher than current bid' })
  }

  // 6. Check user points
  const pointsRec = await prisma.userPoints.findUnique({ where: { userId } })
  const pts = pointsRec?.points ?? 0
  if (pts < amount) {
    throw createError({ statusCode: 400, statusMessage: 'Insufficient points for this bid' })
  }

  // 7. Record bid and update auction in a transaction
  const newBid = await prisma.$transaction(async (tx) => {
    const bidRec = await tx.bid.create({
      data: { auctionId: id, userId, amount }
    })
    await tx.auction.update({
      where: { id },
      data: {
        highestBid: amount,
        highestBidderId: userId
      }
    })
    return bidRec
  })

  // 8. Emit via Socket.IO client with full logging
  try {
    const config = useRuntimeConfig()
    const socket = createSocket(
      import.meta.env.PROD
        ? undefined
        : `http://localhost:${config.public.socketPort}`
    )

    socket.on('connect', () => {
      console.log('[bid.post] socket connected:', socket.id)
      const payload = { auctionId: id, user: me.username, amount: newBid.amount }
      console.log('[bid.post] emitting new-bid →', payload)
      socket.emit('new-bid', payload)
    })

    socket.on('connect_error', (err) => {
      console.error('[bid.post] socket connect_error:', err)
    })

    socket.on('error', (err) => {
      console.error('[bid.post] socket error:', err)
    })

    socket.on('disconnect', (reason) => {
      console.log('[bid.post] socket disconnected:', reason)
    })

    // give it a moment to fire off the emit
    setTimeout(() => {
      console.log('[bid.post] disconnecting socket')
      socket.disconnect()
    }, 500)
  } catch (e) {
    console.error('[bid.post] socket emit failed:', e)
  }

  return { success: true, bid: newBid }
})
