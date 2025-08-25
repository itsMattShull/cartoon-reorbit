// server/utils/autoBid.js
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

export function incrementFor(v) {
  if (v < 1000) return 10
  if (v < 10000) return 100
  return 1000
}

/**
 * Simple anti-snipe: if <= antiSnipeMs remains, extend to now + antiSnipeMs.
 * Returns a Date (possibly the same endAt if no extension was needed).
 */
function maybeExtend(endAt, antiSnipeMs = 2 * 60 * 1000) {
  const now = new Date()
  const msLeft = new Date(endAt).getTime() - now.getTime()
  if (msLeft <= antiSnipeMs) {
    return new Date(now.getTime() + antiSnipeMs)
  }
  return endAt
}

/**
 * Applies proxy auto-bids to the given auction until stable.
 * - Uses increment schedule above.
 * - Only auto-bids from users who CURRENTLY have enough points.
 * - Multiple auto-bidders: highest effective cap first; tie -> earliest createdAt.
 * - Writes Bid rows for both the challenger and the leader’s auto-raise (for history).
 * - Anti-snipe time extension mirrors bid.post.js.
 *
 * @param {import('@prisma/client').PrismaClient} tx  Transactional Prisma client
 * @param {string} auctionId
 * @param {{ antiSnipeMs?: number }} [opts]
 * @returns {Promise<{ finalAuction: any, steps: Array<{userId: string, amount: number, extendedEndAt?: Date}> }>}
 */
export async function applyProxyAutoBids(tx, auctionId, opts = {}) {
  const antiSnipeMs = opts.antiSnipeMs ?? 2 * 60 * 1000

  // Load auction fresh inside the transaction
  let auc = await tx.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true, status: true, endAt: true,
      highestBid: true, highestBidderId: true
    }
  })
  if (!auc) return { finalAuction: null, steps: [] }
  if (auc.status !== 'ACTIVE') return { finalAuction: auc, steps: [] }
  if (new Date(auc.endAt) <= new Date()) return { finalAuction: auc, steps: [] } // already ended

  const steps = []
  let price  = auc.highestBid
  let leader = auc.highestBidderId

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

    const inc  = incrementFor(price)
    const list = capsAt(price, leader)

    // Eligible challengers (not the current leader) who can place >= price+inc
    const challengers = list
      .filter(x => x.userId !== leader && x.cap >= price + inc)
      .sort((a, b) => (b.cap - a.cap) || (a.createdAt - b.createdAt))

    if (!challengers.length) break

    const ch      = challengers[0]
    const leaderRec = list.find(x => x.userId === leader)
    const leadCap = leaderRec?.cap ?? 0

    const needOverPrice = price + inc
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
      // Leader stays in front; mirror leader's auto-raise as a Bid row
      if (leader) {
        await tx.bid.create({ data: { auctionId, userId: leader, amount: price } })
        steps.push({ userId: leader, amount: price })
      }

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
    }

    // tag the *last* step we just executed with the extension (so UI can update end time)
    if (extendedEndAt) {
      steps[steps.length - 1].extendedEndAt = extendedEndAt
    }
  }

  // Read back final (still inside tx)
  auc = await tx.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, status: true, endAt: true, highestBid: true, highestBidderId: true }
  })

  return { finalAuction: auc, steps }
}

/**
 * Broadcast auto-bid steps over Socket.IO so the UI updates live.
 * Call this **after** the transaction that ran applyProxyAutoBids has committed.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} auctionId
 * @param {Array<{userId: string, amount: number, extendedEndAt?: Date}>} steps
 */
export async function broadcastAutoBidSteps(prisma, auctionId, steps) {
  if (!steps?.length) return

  // Look up usernames for payloads
  const uids = Array.from(new Set(steps.map(s => s.userId)))
  const users = await prisma.user.findMany({
    where: { id: { in: uids } },
    select: { id: true, username: true }
  })
  const nameOf = Object.fromEntries(users.map(u => [u.id, u.username || 'Someone']))

  // Socket connection (same pattern as bid.post.js)
  const config = useRuntimeConfig()
  const url = process.env.NODE_ENV === 'production'
    ? undefined
    : `http://localhost:${config.public.socketPort}`

  const socket = createSocket(url, { transports: ['websocket'] })

  await new Promise(resolve => {
    socket.on('connect', () => {
      // Emit each step in order.
      for (const s of steps) {
        socket.emit('new-bid', {
          auctionId,
          user: nameOf[s.userId] || 'Someone',
          amount: s.amount,
          // Only include endAt when a step extended the time; the client will update it.
          ...(s.extendedEndAt ? { endAt: s.extendedEndAt } : {})
        })
      }
      // give the events a tick to flush
      setTimeout(() => {
        socket.disconnect()
        resolve()
      }, 10)
    })
    socket.connect()
  })
}
