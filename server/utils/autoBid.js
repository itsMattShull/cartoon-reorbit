// server/utils/autoBid.js
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

/**
 * Public constant so API routes can use the same window everywhere.
 * The util extends to NOW + ANTI_SNIPE_MS when within the window.
 */
export const ANTI_SNIPE_MS = 60_000

export function incrementFor(v) {
  if (v < 1000) return 10
  if (v < 10000) return 100
  return 1000
}

/**
 * If <= antiSnipeMs remains, extend to now + antiSnipeMs.
 * Returns a Date (possibly unchanged).
 */
function maybeExtend(endAt, antiSnipeMs = ANTI_SNIPE_MS) {
  const now = Date.now()
  const msLeft = new Date(endAt).getTime() - now
  if (msLeft <= antiSnipeMs) {
    return new Date(now + antiSnipeMs)
  }
  return endAt
}

/**
 * Applies proxy auto-bids to the given auction until stable.
 * - Uses increment schedule above.
 * - Only auto-bids from users who CURRENTLY have enough points.
 * - Multiple auto-bidders: highest effective cap first; tie -> earliest createdAt.
 * - Writes Bid rows for both the challenger and the leader’s auto-raise (for history).
 * - Anti-snipe time extension: extends to now + antiSnipeMs when within the window.
 *
 * IMPORTANT: This function **does not** broadcast — it must be called
 * inside a transaction by the API and then the caller should invoke
 * `broadcastAutoBidSteps(...)` **after the transaction commits**.
 *
 * @param {import('@prisma/client').PrismaClient} tx  Transactional Prisma client
 * @param {string} auctionId
 * @param {{ antiSnipeMs?: number }} [opts]
 * @returns {Promise<{ finalAuction: any, steps: Array<{userId: string, amount: number, extendedEndAt?: Date}> }>}
 */
export async function applyProxyAutoBids(tx, auctionId, opts = {}) {
  const antiSnipeMs = opts.antiSnipeMs ?? ANTI_SNIPE_MS

  // Load auction fresh inside the transaction
  let auc = await tx.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true,
      status: true,
      endAt: true,
      highestBid: true,
      highestBidderId: true,
      // 👇 needed so first auto-bid equals starting price (not increment from 0)
      initialBet: true, // If your column is named initialBid/initialPrice, rename accordingly
    }
  })
  if (!auc) return { finalAuction: null, steps: [] }
  if (auc.status !== 'ACTIVE') return { finalAuction: auc, steps: [] }
  if (new Date(auc.endAt) <= new Date()) return { finalAuction: auc, steps: [] } // already ended

  const steps = []

  // 'price' is the last accepted bid amount (0 if none yet)
  let price  = auc.highestBid || 0
  let leader = auc.highestBidderId || null

  const startPrice = Math.max(0, auc.initialBet || 0)

  // Pull all active autobids + current points up-front
  const auto = await tx.auctionAutoBid.findMany({
    where: { auctionId, isActive: true },
    orderBy: { createdAt: 'asc' }, // FIFO for ties
    select: { userId: true, createdAt: true, maxAmount: true }
  })
  if (!auto.length) return { finalAuction: auc, steps }

  // Collect balances for all participants
  const ids = Array.from(new Set(auto.map(a => a.userId).concat(leader ? [leader] : [])))
  const balances = await tx.userPoints.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, points: true }
  })
  const balanceOf = Object.fromEntries(balances.map(b => [b.userId, b.points]))

  function capsAt(currentPrice, currentLeader) {
    const list = auto.map(a => ({
      userId: a.userId,
      createdAt: a.createdAt,
      cap: Math.min(a.maxAmount, balanceOf[a.userId] ?? 0),
      hasAuto: true
    }))
    const inList = list.some(x => x.userId === currentLeader)
    if (currentLeader && !inList) {
      // Non-autobid leader can defend up to current price
      list.push({ userId: currentLeader, cap: currentPrice, createdAt: new Date(0), hasAuto: false })
    }
    return list
  }

  while (true) {
    // Stop if the auction has actually reached/passed end time during this loop
    if (new Date(auc.endAt) <= new Date()) break

    // Use the displayed price to choose increment scale
    const incBase = Math.max(price, startPrice)
    const inc     = incrementFor(incBase)

    // ⬅️ KEY CHANGE:
    // If there is no accepted bid yet (leader == null and price == 0),
    // the minimum challenger bid is the starting price (initialBet),
    // otherwise it's the usual price + increment.
    const minChallengerBid = leader ? (price + inc) : startPrice

    const list = capsAt(price, leader)

    // Eligible challengers (not the current leader) who can place at least minChallengerBid
    const challengers = list
      .filter(x => x.userId !== leader && x.cap >= minChallengerBid)
      .sort((a, b) => (b.cap - a.cap) || (a.createdAt - b.createdAt))

    if (!challengers.length) break

    const ch        = challengers[0]
    const leaderRec = list.find(x => x.userId === leader)
    const leadCap   = leaderRec?.cap ?? 0

    // ⬅️ KEY CHANGE:
    // Need to beat "price + inc" only after at least one accepted bid exists.
    const needOverPrice = leader ? (price + inc) : startPrice
    const needOverLead  = leadCap + incrementFor(leadCap)
    const challengerBid = Math.min(ch.cap, Math.max(needOverPrice, needOverLead))

    // 1) Record challenger bid
    await tx.bid.create({ data: { auctionId, userId: ch.userId, amount: challengerBid } })
    steps.push({ userId: ch.userId, amount: challengerBid })

    // 2) Decide who is leader after challenger
    price = challengerBid
    let extendedEndAt = null

    if (challengerBid > leadCap) {
      // Challenger becomes new leader
      leader = ch.userId

      // Anti-snipe check/extend
      const newEndAt = maybeExtend(auc.endAt, antiSnipeMs)
      const didExtend = newEndAt.getTime() !== new Date(auc.endAt).getTime()
      if (didExtend) extendedEndAt = newEndAt

      // Persist auction
      await tx.auction.update({
        where: { id: auctionId },
        data: {
          highestBid: price,
          highestBidderId: leader,
          ...(didExtend ? { endAt: newEndAt } : {})
        }
      })
      if (didExtend) auc.endAt = newEndAt
    } else {
      // Leader stays in front; auto-raise just enough to beat the challenger
      const inc2 = incrementFor(Math.max(price, startPrice))
      const leaderBid = Math.min(leadCap, price + inc2)

      if (leader && leaderBid > price) {
        await tx.bid.create({
          data: { auctionId, userId: leader, amount: leaderBid }
        })
        steps.push({ userId: leader, amount: leaderBid })
        price = leaderBid
      }

      // Anti-snipe check/extend
      const newEndAt = maybeExtend(auc.endAt, antiSnipeMs)
      const didExtend = newEndAt.getTime() !== new Date(auc.endAt).getTime()
      if (didExtend) {
        steps[steps.length - 1].extendedEndAt = newEndAt
        auc.endAt = newEndAt
      }

      await tx.auction.update({
        where: { id: auctionId },
        data: {
          highestBid: price,
          highestBidderId: leader,
          ...(didExtend ? { endAt: newEndAt } : {})
        }
      })
    }

    if (extendedEndAt) {
      steps[steps.length - 1].extendedEndAt = extendedEndAt
    }
  }

  // Read back final (still inside tx)
  auc = await tx.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true, status: true, endAt: true,
      highestBid: true, highestBidderId: true,
      initialBet: true
    }
  })

  return { finalAuction: auc, steps }
}

/**
 * Broadcast auto-bid steps over Socket.IO so the UI updates live.
 * Call this **after** the transaction that ran applyProxyAutoBids has committed.
 *
 * NOTE: We emit exactly one "new-bid" per written Bid step and attach `endAt`
 * ONLY on the step that actually extended time (if any).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} auctionId
 * @param {Array<{userId: string, amount: number, extendedEndAt?: Date}>} steps
 */
export async function broadcastAutoBidSteps(prisma, auctionId, steps) {
  if (!steps?.length) return
  console.log(`[autoBid] broadcasting ${steps.length} steps for auction ${auctionId}`)

  const uids = Array.from(new Set(steps.map(s => s.userId)))
  const users = await prisma.user.findMany({
    where: { id: { in: uids } },
    select: { id: true, username: true }
  })
  const nameOf = Object.fromEntries(users.map(u => [u.id, u.username || 'Someone']))

  const url = useRuntimeConfig().socketOrigin
  console.log('[autoBid] connecting socket to', url || '(prod default)')

  await new Promise((resolve) => {
    const socket = createSocket(url, {
      path: useRuntimeConfig().socketPath,
      transports: ['websocket', 'polling']
    })
    let done = false
    const finish = () => {
      if (done) return
      done = true
      try { socket.disconnect() } catch {}
      resolve()
    }

    socket.on('connect', () => {
      console.log('[autoBid] broadcasting', steps.length, 'steps')
      for (const s of steps) {
        const endAtIso = s.extendedEndAt
          ? (typeof s.extendedEndAt === 'string'
              ? s.extendedEndAt
              : new Date(s.extendedEndAt).toISOString())
          : undefined

        socket.emit('new-bid', {
          auctionId: String(auctionId),
          user: nameOf[s.userId] || 'Someone',
          amount: s.amount,
          ...(endAtIso ? { endAt: endAtIso } : {})
        })
      }
      setTimeout(finish, 10)
    })

    socket.on('disconnect', (reason) => console.log('[SOCKET] disconnected', reason))
    socket.on('connect_error', (err) => console.error('[SOCKET] connect_error', err?.message || err))
    socket.io.on('reconnect_attempt', (n) => console.log('[SOCKET] reconnect_attempt', n))
    socket.io.on('reconnect_error', (err) => console.error('[SOCKET] reconnect_error', err?.message || err))
    socket.io.on('reconnect_failed', () => console.error('[SOCKET] reconnect_failed'))
    socket.io.on('open', () => console.log('[SOCKET] transport open'))
    socket.io.on('close', (reason) => console.log('[SOCKET] transport close', reason))
    setTimeout(finish, 1500)
  })
}

export async function applyProxyAutoBidsAndBroadcast(prisma, auctionId, opts = {}) {
  let result = { finalAuction: null, steps: [] }
  await prisma.$transaction(async (tx) => {
    result = await applyProxyAutoBids(tx, auctionId, opts)
  })
  if (result.steps?.length) {
    await broadcastAutoBidSteps(prisma, auctionId, result.steps)
  }
  return result
}
