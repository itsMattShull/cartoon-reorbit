// server/utils/tradeAuctionBan.js
// Database half of the admin "Ban Trades/Auctions" tool. The pure rules (pair order, messages) live in
// server/utils/tradeAuctionBanRules.js.
//
// While a ban between two users exists:
//   * neither can create, counter or accept a trade offer with the other (server/utils/tradeOffer.js
//     validateTradeOfferInputs and server/api/trade/offers/[id]/accept.post.js);
//   * neither can bid or set an auto-bid on an auction the other created (server/api/auction/[id]/bid.post.js,
//     autobid.post.js), and an existing auto-bid of theirs never raises on it (server/utils/autoBid.js).
// Creating a ban also withdraws, quietly, every PENDING offer between them and turns off each one's auto-bids on the
// other's active auctions. Bids already placed stay. Deleting a ban restores nothing. Admin-initiated trades
// (server/api/admin/trade-offers.post.js) are not affected.
import { createError } from 'h3'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import {
  TRADE_BANNED_MESSAGE,
  BID_BANNED_MESSAGE,
  orderBanPair,
  banPairWhere,
  bansBetweenWhere,
  otherSideOf,
  normalizeBanReason
} from '@/server/utils/tradeAuctionBanRules'

export * from './tradeAuctionBanRules'

/** True when a ban covers these two users. Accepts a Prisma client or a transaction. */
export async function isTradeAuctionBanned (client, a, b) {
  if (!a || !b || a === b) return false
  const row = await client.tradeAuctionBan.findUnique({
    where: { userAId_userBId: banPairWhere(a, b) },
    select: { id: true }
  })
  return !!row
}

/** Throws 403 "You can't trade with this user." when the two are banned from trading with each other. */
export async function assertCanTrade (client, a, b) {
  if (await isTradeAuctionBanned(client, a, b)) {
    throw createError({ statusCode: 403, statusMessage: TRADE_BANNED_MESSAGE })
  }
}

/** Throws 403 when `bidderId` is banned with the auction's creator. Official/system auctions have no creator. */
export async function assertCanBid (client, bidderId, creatorId) {
  if (!creatorId) return
  if (await isTradeAuctionBanned(client, bidderId, creatorId)) {
    throw createError({ statusCode: 403, statusMessage: BID_BANNED_MESSAGE })
  }
}

/** The subset of `otherIds` that `userId` is banned with, as a Set. One query. */
export async function bannedAmong (client, userId, otherIds) {
  const others = [...new Set((otherIds || []).filter(id => id && id !== userId))]
  if (!userId || !others.length) return new Set()
  const rows = await client.tradeAuctionBan.findMany({
    where: bansBetweenWhere(userId, others),
    select: { userAId: true, userBId: true }
  })
  return new Set(rows.map(r => otherSideOf(r, userId)))
}

const BAN_SELECT = {
  id: true,
  reason: true,
  createdById: true,
  createdByUsername: true,
  createdAt: true,
  userA: { select: { id: true, username: true } },
  userB: { select: { id: true, username: true } }
}

/** Newest first. `user` filters to bans where either username contains it. */
export async function listTradeAuctionBans (client, { page = 1, limit = 25, user = '' } = {}) {
  const where = user
    ? {
        OR: [
          { userA: { username: { contains: user, mode: 'insensitive' } } },
          { userB: { username: { contains: user, mode: 'insensitive' } } }
        ]
      }
    : {}
  const [total, items] = await Promise.all([
    client.tradeAuctionBan.count({ where }),
    client.tradeAuctionBan.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: BAN_SELECT
    })
  ])
  return { items, total, page, limit }
}

/**
 * Creates the ban, then in the same transaction withdraws every PENDING trade offer between the two users (releasing
 * the points the initiator had locked in it) and turns off each one's auto-bids on the other's ACTIVE auctions.
 *
 * @returns {{ ban, withdrawnTrades: number, autoBidsStopped: number }}
 */
export async function createTradeAuctionBan (db, { admin, userIds, reason }) {
  let pair
  try {
    pair = orderBanPair(userIds?.[0], userIds?.[1])
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  const [userAId, userBId] = pair
  const users = await db.user.findMany({ where: { id: { in: pair } }, select: { id: true, username: true } })
  if (users.length !== 2) throw createError({ statusCode: 404, statusMessage: 'One of those users no longer exists.' })

  const cleanReason = normalizeBanReason(reason)

  let result
  try {
    result = await db.$transaction(async (tx) => {
      const ban = await tx.tradeAuctionBan.create({
        data: { userAId, userBId, reason: cleanReason, createdById: admin.id, createdByUsername: admin.username || null },
        select: BAN_SELECT
      })

      // Same lock order as reject.post.js: offer rows first, then the LockedPoints rows.
      const pending = await tx.tradeOffer.findMany({
        where: {
          status: 'PENDING',
          OR: [
            { initiatorId: userAId, recipientId: userBId },
            { initiatorId: userBId, recipientId: userAId }
          ]
        },
        select: { id: true }
      })
      const offerIds = pending.map(o => o.id)
      let withdrawnTrades = 0
      if (offerIds.length) {
        const { count } = await tx.tradeOffer.updateMany({
          where: { id: { in: offerIds }, status: 'PENDING' },
          data: { status: 'WITHDRAWN', updatedAt: new Date() }
        })
        withdrawnTrades = count
        await tx.lockedPoints.updateMany({
          where: { contextType: 'TRADE', contextId: { in: offerIds }, status: 'ACTIVE' },
          data: { status: 'RELEASED' }
        })
      }

      const { count: autoBidsStopped } = await tx.auctionAutoBid.updateMany({
        where: {
          isActive: true,
          OR: [
            { userId: userAId, auction: { creatorId: userBId, status: 'ACTIVE' } },
            { userId: userBId, auction: { creatorId: userAId, status: 'ACTIVE' } }
          ]
        },
        data: { isActive: false }
      })

      return { ban, withdrawnTrades, autoBidsStopped }
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'These two users are already banned from trading and auctions with each other.' })
    }
    throw err
  }

  // After the commit: logAdminChange swallows its own errors, and a failed statement would poison the transaction.
  const { ban } = result
  for (const target of [ban.userA, ban.userB]) {
    await logAdminChange(db, {
      userId: admin.id,
      area: 'Admin:TradeAuctionBan',
      key: 'createTradeAuctionBan',
      prevValue: null,
      newValue: {
        banId: ban.id,
        users: [ban.userA.username, ban.userB.username],
        reason: ban.reason,
        withdrawnTrades: result.withdrawnTrades,
        autoBidsStopped: result.autoBidsStopped
      },
      targetUserId: target.id,
      targetUsername: target.username
    })
  }
  return result
}

/** Deletes a ban. Restores nothing: withdrawn trades stay withdrawn and stopped auto-bids stay off. */
export async function deleteTradeAuctionBan (db, { admin, id }) {
  const ban = await db.tradeAuctionBan.findUnique({ where: { id }, select: BAN_SELECT })
  if (!ban) throw createError({ statusCode: 404, statusMessage: 'That ban no longer exists.' })
  const { count } = await db.tradeAuctionBan.deleteMany({ where: { id } })
  if (count !== 1) throw createError({ statusCode: 404, statusMessage: 'That ban no longer exists.' })

  for (const target of [ban.userA, ban.userB]) {
    await logAdminChange(db, {
      userId: admin.id,
      area: 'Admin:TradeAuctionBan',
      key: 'deleteTradeAuctionBan',
      prevValue: {
        banId: ban.id,
        users: [ban.userA.username, ban.userB.username],
        reason: ban.reason,
        createdBy: ban.createdByUsername,
        createdAt: ban.createdAt
      },
      newValue: null,
      targetUserId: target.id,
      targetUsername: target.username
    })
  }
  return { success: true }
}
