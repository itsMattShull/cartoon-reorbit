// server/api/auction/[id]/bid.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { prisma as db } from '@/server/prisma'
import { applyProxyAutoBids, incrementFor } from '@/server/utils/autoBid'
import { scheduleAuctionClose } from '@/server/utils/queues'
import { assertFeaturedEligibility, assertNoConcurrentFeaturedLead } from '@/server/utils/featuredEligibility'
import { notifyOutbid, notifyAuctionBid } from '@/server/utils/notifications'

const ANTI_SNIPE_MS = 60_000

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
    // First statement, before any read. Without this, two concurrent bid
    // requests for the same auction can both read the same stale highestBid,
    // both compute the same requiredBid, and both pass the check below --
    // writing two Bid rows at the identical amount with the winner decided
    // only by whichever UPDATE happened to commit last. Locking the row here
    // serializes every writer (manual bids and autobid.post.js's own
    // transaction alike) so each one re-reads the real, post-previous-write
    // state before deciding whether this bid is still valid.
    await tx.$executeRaw`SELECT id FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`

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
        featuredOwnLimit: true,
        userCtoon: {
          select: {
            ctoonId: true,
            ctoon: { select: { isSecondEdition: true, relatedFirstEditionId: true } }
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

    // Featured-auction eligibility. For Second Edition cToons this counts copies
    // across both editions (see server/utils/featuredEligibility.js).
    await assertFeaturedEligibility(tx, userId, {
      isFeatured: fresh.isFeatured,
      featuredOwnLimit: fresh.featuredOwnLimit,
      ctoon: {
        ctoonId: fresh.userCtoon?.ctoonId,
        isSecondEdition: fresh.userCtoon?.ctoon?.isSecondEdition,
        relatedFirstEditionId: fresh.userCtoon?.ctoon?.relatedFirstEditionId
      }
    })

    // A user can't hold the lead on more than one active featured auction for
    // the same cToon (1st/2nd edition combined) at a time.
    await assertNoConcurrentFeaturedLead(tx, userId, {
      isFeatured: fresh.isFeatured,
      excludeAuctionId: auctionId,
      ctoon: {
        ctoonId: fresh.userCtoon?.ctoonId,
        isSecondEdition: fresh.userCtoon?.ctoon?.isSecondEdition,
        relatedFirstEditionId: fresh.userCtoon?.ctoon?.relatedFirstEditionId
      }
    })

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
    // Summed in Postgres rather than shipping every lock row over the wire to
    // reduce in JS. This runs inside the auction's hot transaction, and the new
    // (userId, status) INCLUDE (amount) index makes it index-only.
    const lockAgg = await tx.lockedPoints.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        status: 'ACTIVE',
        NOT: {
          AND: [
            { contextType: 'AUCTION' },
            { contextId: auctionId },
          ],
        },
      },
    })
    const lockedSum = lockAgg._sum.amount || 0
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

  // 5) If endAt was extended by anti-snipe, reschedule the BullMQ close job
  if (finalEndAt.getTime() !== new Date(pre.endAt).getTime()) {
    scheduleAuctionClose(auctionId, finalEndAt).catch(err =>
      console.error('[AuctionClose] Failed to reschedule after bid:', err)
    )
  }

  // 5b) In-app notifications.
  //
  // Placement matters here. Not inside the transaction above: that block already
  // runs ~10 queries plus the unbounded proxy auto-bid loop while holding row
  // locks on this auction, and every concurrent bidder serialises behind it.
  // Not down with the Discord DM either: that sits behind a fresh socket.io
  // handshake with a 1500ms worst case, and the bidder's response already waits
  // on it. After the commit, not awaited, is the only place that costs the
  // bidder nothing.
  //
  // The recipients come from `outbidUserIds`, which the transaction already
  // accumulates from both the manual displacement and the proxy cascade. Note
  // the DM path below deliberately uses a lossier reconstruction that picks only
  // the LAST leader to lose the lead, because DMs are expensive; the hub is
  // cheap, so it can notify everyone who was actually outbid. In a cascade
  // A → B → A → C, the DM path tells only A, while this tells both A and B.
  ;(async () => {
    const finalLeaderId = finalAuction?.highestBidderId ?? null
    const finalAmount   = finalAuction?.highestBid ?? manualAmount

    const ctoon = await db.auction.findUnique({
      where: { id: auctionId },
      select: { userCtoon: { select: { ctoon: { select: { name: true } } } } }
    })
    const ctoonName = ctoon?.userCtoon?.ctoon?.name || null

    const outbid = Array.from(new Set(outbidUserIds))
      .filter(uid => uid && uid !== finalLeaderId)
    for (const uid of outbid) {
      await notifyOutbid(db, { userId: uid, auctionId, ctoonName, amount: finalAmount })
    }

    // One notification per request, not per Bid row. A single manual bid into a
    // proxy war writes many Bid rows, and the seller does not want a card for
    // each rung of the ladder. The collapse index makes repeat bids over time
    // bump a count rather than stack up, too.
    if (pre.creatorId && pre.creatorId !== userId) {
      await notifyAuctionBid(db, {
        userId: pre.creatorId, auctionId, ctoonName, amount: finalAmount
      })
    }
  })().catch(err => console.error('[notifications] bid path:', err?.message || err))

  // 6) Emit socket events
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

  // 7) Notify only the latest outbid leader via Discord DM (non-blocking)
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
