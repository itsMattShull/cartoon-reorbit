// server/utils/auctionSettle.js
// Settles one ended auction: picks the winning bid, moves the cToon and the points, releases/consumes the
// bid holds and writes the ownership + points logs, all in one transaction.
//
// Lives here rather than inside server/socket-server.js (which starts servers on import) so it can be
// called directly — see tests/auctionSettlement.db.test.js. The socket server passes in its own db client,
// the close-job scheduler and the "you won" notifier, and broadcasts the returned result.
//
// Returns null when there is nothing to broadcast (auction missing/already closed, closed too early and
// rescheduled, or its end was extended by a late bid); otherwise { winnerId, winningBid } for 'auction-ended'.
import { resolveAuctionCloseOutcome, AUCTION_CLOSE_DOUBLE_SALE } from './auctionClose.js'

export async function settleAuction(auctionId, { db, scheduleAuctionClose, notifyAuctionWon }) {
  const auc = await db.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true, status: true, endAt: true, creatorId: true, userCtoonId: true, createdAt: true,
      // Only for the "you won" notification's text.
      userCtoon: { select: { ctoon: { select: { name: true } } } }
    }
  })

  // Guard: already closed or cancelled (e.g. duplicate job fire)
  if (!auc || auc.status !== 'ACTIVE') return null

  // Re-check: if endAt is still in the future the job fired too early (can happen
  // due to timer imprecision or clock skew). Reschedule rather than silently
  // completing — a bare `return` would drop the job and leave the auction stuck.
  if (new Date(auc.endAt) > new Date()) {
    await scheduleAuctionClose(auctionId, auc.endAt)
    return null
  }

  const { id, creatorId, userCtoonId } = auc
  const now = new Date()

  // Resolve seller: creatorId or OFFICIAL_USERNAME
  let resolvedCreatorId = creatorId
  if (!resolvedCreatorId && process.env.OFFICIAL_USERNAME) {
    const official = await db.user.findUnique({
      where: { username: process.env.OFFICIAL_USERNAME },
      select: { id: true }
    })
    resolvedCreatorId = official?.id || null
  }
  let resolvedCreatorUsername = null
  if (resolvedCreatorId) {
    const seller = await db.user.findUnique({
      where: { id: resolvedCreatorId },
      select: { username: true }
    })
    resolvedCreatorUsername = seller?.username || null
  }

  // Highest bid placed before auction end; earliest timestamp breaks ties
  const winningBid = await db.bid.findFirst({
    where: {
      auctionId: id,
      createdAt: { lte: auc.endAt }
    },
    orderBy: [
      { amount: 'desc' },
      { createdAt: 'asc' }
    ],
    select: { userId: true, amount: true }
  })

  // Will be set inside the transaction if endAt was extended after our initial read.
  let extendedEndAt = null
  // Set if this auction turned out to be a duplicate of one that already sold.
  let settledAsDoubleSale = false

  await db.$transaction(async tx => {
    // Re-check inside the transaction to close the TOCTOU gap: a concurrent bid
    // with anti-snipe may have extended endAt after our initial read above, but
    // scheduleAuctionClose skips rescheduling when the job is already 'active'.
    const current = await tx.auction.findUnique({
      where: { id },
      select: { status: true, endAt: true }
    })
    if (!current || current.status !== 'ACTIVE') return
    if (new Date(current.endAt) > now) {
      extendedEndAt = current.endAt
      return
    }

    // Has another auction already sold this same physical cToon while this one
    // was running? That should be impossible now that a partial unique index
    // stops two ACTIVE auctions existing for one UserCtoon, but paying out on a
    // pair that predates it would debit a second winner, credit the seller
    // twice and move the cToon off the first winner — so it is checked, not
    // assumed.
    const otherAuctions = await tx.auction.findMany({
      where: { userCtoonId, id: { not: id } },
      select: { id: true, status: true, winnerId: true, winnerAt: true }
    })
    const { outcome, conflictingAuctionId } = resolveAuctionCloseOutcome({
      auction: auc,
      winningBid,
      otherAuctions
    })

    if (outcome === AUCTION_CLOSE_DOUBLE_SALE) {
      console.error(
        `[auction] refusing to settle ${id}: cToon ${userCtoonId} was already sold by auction ` +
        `${conflictingAuctionId} while this listing was live. Closing with no winner; no points ` +
        `moved and the cToon was left where it is. Needs a manual refund decision.`
      )
      settledAsDoubleSale = true
      await tx.auction.update({
        where: { id },
        data: { status: 'CLOSED', winnerAt: now }
      })
      // Release every hold so no bidder stays locked out of their points. The
      // cToon is deliberately untouched: it belongs to the other sale's winner.
      await tx.lockedPoints.updateMany({
        where: { status: 'ACTIVE', contextType: 'AUCTION', contextId: id },
        data:  { status: 'RELEASED' }
      })
      return
    }

    await tx.auction.update({
      where: { id },
      data: {
        status: 'CLOSED',
        winnerId: winningBid?.userId || null,
        highestBidderId: winningBid?.userId || null,
        winnerAt: now,
        ...(winningBid && { highestBid: winningBid.amount })
      }
    })

    if (winningBid) {
      const uc = await tx.userCtoon.update({
        where:  { id: userCtoonId },
        data:   { userId: winningBid.userId, isTradeable: true },
        select: { id: true, ctoonId: true, mintNumber: true }
      })

      // Snapshot for the "last auction sold" collection-worth metric — kept
      // fresh at write time so reading it never needs a live scan over the
      // full Auction table. See prisma/schema.prisma's comment on these
      // columns.
      await tx.ctoon.update({
        where: { id: uc.ctoonId },
        data:  { lastAuctionSoldPrice: winningBid.amount, lastAuctionSoldAt: now }
      })

      await tx.userTradeListItem.deleteMany({
        where: { userCtoonId, userId: { not: winningBid.userId } }
      })
      await tx.ctoonOwnerLog.create({
        data: {
          userId:      winningBid.userId,
          ctoonId:     uc.ctoonId,
          userCtoonId: uc.id,
          mintNumber:  uc.mintNumber,
          method:      'AUCTION',
          counterpartyUserId: resolvedCreatorId,
          counterpartyUsername: resolvedCreatorUsername
        }
      })

      const loserPts = await tx.userPoints.update({
        where: { userId: winningBid.userId },
        data:  { points: { decrement: winningBid.amount } }
      })
      await tx.pointsLog.create({
        data: {
          userId:    winningBid.userId,
          points:    winningBid.amount,
          total:     loserPts.points,
          method:    'Auction',
          direction: 'decrease'
        }
      })

      // "You won" goes here, inside the settle branch, rather than after the
      // transaction. Two reasons. It is then atomic with the payout, so a
      // notification can never exist for a sale that rolled back. And it is
      // unreachable from the two terminal paths above that must NOT produce one:
      // the early return when a concurrent anti-snipe bid extended endAt (no
      // sale happened yet), and the DOUBLE_SALE branch, where the bidder did not
      // get the cToon and is owed a manual refund decision — telling them they
      // won would be worse than telling them nothing.
      await notifyAuctionWon(tx, {
        userId: winningBid.userId,
        auctionId: id,
        ctoonName: auc.userCtoon?.ctoon?.name || null,
        amount: winningBid.amount
      })

      await tx.lockedPoints.updateMany({
        where: { userId: winningBid.userId, status: 'ACTIVE', contextType: 'AUCTION', contextId: id },
        data:  { status: 'CONSUMED' }
      })
      await tx.lockedPoints.updateMany({
        where: { status: 'ACTIVE', contextType: 'AUCTION', contextId: id },
        data:  { status: 'RELEASED' }
      })

      if (resolvedCreatorId) {
        const creatorPts = await tx.userPoints.upsert({
          where:  { userId: resolvedCreatorId },
          create: { userId: resolvedCreatorId, points: winningBid.amount },
          update: { points: { increment: winningBid.amount } }
        })
        await tx.pointsLog.create({
          data: {
            userId:    resolvedCreatorId,
            points:    winningBid.amount,
            total:     creatorPts.points,
            method:    'Auction',
            direction: 'increase'
          }
        })
      }
    } else {
      await tx.userCtoon.update({
        where: { id: userCtoonId },
        data:  { isTradeable: true }
      })
      await tx.lockedPoints.updateMany({
        where: { status: 'ACTIVE', contextType: 'AUCTION', contextId: id },
        data:  { status: 'RELEASED' }
      })
    }
  })

  // endAt was extended by a concurrent anti-snipe bid; reschedule and bail out.
  if (extendedEndAt) {
    await scheduleAuctionClose(auctionId, extendedEndAt)
    return null
  }

  return {
    winnerId:   settledAsDoubleSale ? null : (winningBid?.userId ?? null),
    winningBid: settledAsDoubleSale ? 0    : (winningBid?.amount ?? 0)
  }
}
