// server/api/auction/[id]/autobid.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { prisma as db } from '@/server/prisma'
import { applyProxyAutoBids } from '@/server/utils/autoBid'

const SNIPE_WINDOW_MS = 60_000   // extend only if a bid occurs with <=60s left
const SNIPE_EXTEND_MS = 30_000   // extend by +30s FROM CURRENT endAt

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

  const maxCap = Number(maxAmount)
  if (!Number.isFinite(maxCap) || maxCap <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid max auto bid amount' })
  }

  // --- Load auction & basic guards ---
  const auc = await db.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, status: true, endAt: true, highestBid: true, highestBidderId: true }
  })
  if (!auc || auc.status !== 'ACTIVE') {
    throw createError({ statusCode: 400, statusMessage: 'Auction not active' })
  }
  const now = new Date()
  if (new Date(auc.endAt) <= now) {
    throw createError({ statusCode: 400, statusMessage: 'Auction already ended' })
  }

  // --- Upsert user's auto-bid ---
  await db.auctionAutoBid.upsert({
    where: { auctionId_userId: { auctionId, userId } }, // requires @@unique([auctionId,userId]) in schema
    create: { auctionId, userId, maxAmount: Math.floor(maxCap), isActive: true },
    update: { maxAmount: Math.floor(maxCap), isActive: true }
  })

  // --- Run proxy auto-bids + optional snipe-extension in a single transaction ---
  let finalEndAt = new Date(auc.endAt)
  let steps = []
  let finalAuction = auc

  await db.$transaction(async (tx) => {
    // Re-read fresh inside the tx
    const fresh = await tx.auction.findUnique({
      where: { id: auctionId },
      select: { id: true, status: true, endAt: true, highestBid: true, highestBidderId: true }
    })
    if (!fresh || fresh.status !== 'ACTIVE') return

    const preEndAt = new Date(fresh.endAt)
    if (preEndAt <= new Date()) return // already ended; do nothing

    // Simulate / write all needed proxy steps
    const res = await applyProxyAutoBids(tx, auctionId)
    steps = res.steps || []
    finalAuction = res.finalAuction || fresh

    // Only consider extending if at least one bid was actually written
    const shouldSnipeExtend =
      steps.length > 0 && (preEndAt.getTime() - Date.now()) <= SNIPE_WINDOW_MS

    if (shouldSnipeExtend) {
      finalEndAt = new Date(preEndAt.getTime() + SNIPE_EXTEND_MS)
      await tx.auction.update({
        where: { id: auctionId },
        data: { endAt: finalEndAt }
      })
    } else {
      finalEndAt = preEndAt
    }
  })

  // --- If no steps occurred, nothing to broadcast; just acknowledge ---
  if (!steps.length) {
    return { ok: true, changed: false, endAt: finalEndAt }
  }

  // --- Build username map for the step emit payloads ---
  const uniqueIds = Array.from(new Set(steps.map(s => s.userId)))
  const users = await db.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, username: true }
  })
  const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Someone']))

  // --- Emit socket events for each step (last one carries endAt if extended) ---
  const config = useRuntimeConfig()
  const url = process.env.NODE_ENV === 'production'
    ? undefined
    : `http://localhost:${config.public.socketPort}`

  await new Promise((resolve) => {
    const socket = createSocket(url, { transports: ['websocket'] })
    socket.on('connect', async () => {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i]
        const isLast = i === steps.length - 1
        socket.emit('new-bid', {
          auctionId,
          user: nameById[s.userId] || 'Someone',
          amount: s.amount,
          // only include endAt on the final step so the UI adjusts once
          ...(isLast ? { endAt: finalEndAt } : {})
        })
      }
      socket.disconnect()
      resolve()
    })
    // In case connect fails in dev, still resolve so the API doesn't hang
    setTimeout(() => resolve(), 1500)
  })

  return {
    ok: true,
    changed: true,
    steps: steps.length,
    highestBid: finalAuction?.highestBid ?? null,
    highestBidderId: finalAuction?.highestBidderId ?? null,
    endAt: finalEndAt
  }
})
