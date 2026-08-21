import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'
import { notifyTradeOfferAccepted } from '@/server/utils/notifications'
import { fmtPoints } from '@/server/utils/tradeOfferRules'

// Postgres int4 max. Points columns are Int (32-bit); crediting a side past
// this would make Postgres raise mid-transaction, and because that happens
// inside the same transaction as the offer-row claim, the claim rolls back
// too -- the offer would just go back to PENDING and fail identically on
// every retry. Checked up front instead so this is a clean, explained 400.
const INT4_MAX = 2147483647

export default defineEventHandler(async (event) => {
  // 1) Authenticate
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // 2) Load the offer + ctoon join rows
  const offerId = event.context.params.id
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: offerId },
    include: {
      ctoons: { include: { userCtoon: true } }
    }
  })
  if (!offer) throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  if (offer.recipientId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Not your incoming offer' })
  }
  if (offer.status !== 'PENDING') {
    throw createError({ statusCode: 400, statusMessage: 'Offer is not pending' })
  }

  // 2a) Fetch initiator’s Discord info
  const initiator = await prisma.user.findUnique({
    where: { id: offer.initiatorId },
    select: { discordId: true, username: true }
  })

  // 3) Verify initiator still owns all OFFERED cToons
  const offeredIds = offer.ctoons
    .filter(tc => tc.role === 'OFFERED')
    .map(tc => tc.userCtoonId)
  if (offeredIds.length) {
    const stillOwned = await prisma.userCtoon.count({
      where: { id: { in: offeredIds }, userId: offer.initiatorId }
    })
    if (stillOwned !== offeredIds.length) {
      await prisma.tradeOffer.update({
        where: { id: offerId },
        data: { status: 'REJECTED' }
      })
      throw createError({
        statusCode: 400,
        statusMessage:
          'Offer rejected: one or more offered cToons are no longer owned by the initiator.'
      })
    }
  }

  // 4) Verify recipient still owns all REQUESTED cToons
  const requestedIds = offer.ctoons
    .filter(tc => tc.role === 'REQUESTED')
    .map(tc => tc.userCtoonId)
  if (requestedIds.length) {
    const stillOwned = await prisma.userCtoon.count({
      where: { id: { in: requestedIds }, userId: offer.recipientId }
    })
    if (stillOwned !== requestedIds.length) {
      await prisma.tradeOffer.update({
        where: { id: offerId },
        data: { status: 'REJECTED' }
      })
      throw createError({
        statusCode: 400,
        statusMessage:
          'Offer rejected: one or more requested cToons are no longer owned by the recipient.'
      })
    }
  }

  // 5) Verify initiator still has the points (basic guard)
  const pts = await prisma.userPoints.findUnique({ where: { userId: offer.initiatorId } })
  if ((pts?.points || 0) < offer.pointsOffered) {
    await prisma.tradeOffer.update({
      where: { id: offerId },
      data: { status: 'REJECTED' }
    })
    throw createError({
      statusCode: 400,
      statusMessage:
        'Offer rejected: initiator no longer has sufficient points.'
    })
  }

  // 5b) Verify the RECIPIENT (the accepting user) can actually afford what's
  // being requested, and that crediting either side won't overflow the Int
  // column. Unlike steps 3-5 above, failure here must NOT reject the offer:
  // pointsRequested was never locked when the offer arrived (see the schema
  // comment on TradeOffer.pointsRequested), so the recipient has to be free
  // to top up and retry later, or decline/counter instead. The message below
  // only ever describes the caller's OWN balance -- it is never shown to the
  // initiator, who has no way to trigger this check themselves (recipientId
  // !== userId was already enforced above).
  if (offer.pointsOffered > 0 || offer.pointsRequested > 0) {
    const [recipientPts, recipientLockAgg] = await Promise.all([
      prisma.userPoints.findUnique({ where: { userId: offer.recipientId }, select: { points: true } }),
      prisma.lockedPoints.aggregate({
        _sum: { amount: true },
        where: { userId: offer.recipientId, status: 'ACTIVE' }
      })
    ])
    const recipientGross = recipientPts?.points || 0
    const recipientLocked = recipientLockAgg._sum.amount || 0
    const recipientAvailable = Math.max(0, recipientGross - recipientLocked)

    if (offer.pointsRequested > recipientAvailable) {
      throw createError({
        statusCode: 400,
        statusMessage: `You need ${fmtPoints(offer.pointsRequested - recipientAvailable)} more points to accept this trade — you have ${fmtPoints(recipientAvailable)} available.`
      })
    }

    const initiatorGross = pts?.points || 0
    if (initiatorGross + offer.pointsRequested > INT4_MAX || recipientGross + offer.pointsOffered > INT4_MAX) {
      throw createError({
        statusCode: 400,
        statusMessage: 'This trade would push a balance past the maximum allowed and cannot be completed.'
      })
    }
  }

  // 6) Transfer cToons, move points, log, accept
  await prisma.$transaction(async (tx) => {
    // Claim the offer before touching anything else. The status check above
    // runs outside this transaction, so without this a counter or a second
    // accept committing in between would still let the transfers below run —
    // paying the initiator's points out twice and moving cToons that are, by
    // then, committed to a different pending offer.
    //
    // Claiming first also fixes the lock ordering: every terminal transition
    // (accept, reject, counter) now takes the TradeOffer row lock before the
    // LockedPoints one, so an accept racing a counter blocks instead of
    // deadlocking.
    const claimed = await tx.tradeOffer.updateMany({
      where: { id: offerId, status: 'PENDING' },
      data: { status: 'ACCEPTED', updatedAt: new Date() }
    })
    if (claimed.count !== 1) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This offer is no longer pending.'
      })
    }

    if (offer.pointsOffered > 0 || offer.pointsRequested > 0) {
      // Both fields move in the same two rows: initiator loses pointsOffered
      // and gains pointsRequested; recipient is the mirror image. Netted into
      // one delta per user rather than four separate updates.
      const initiatorNet = offer.pointsRequested - offer.pointsOffered
      const recipientNet = offer.pointsOffered - offer.pointsRequested
      const netFor = (userId) => (userId === offer.initiatorId ? initiatorNet : recipientNet)

      // Both UserPoints rows are taken in userId order, not initiator-then-
      // recipient. Two accepts between the same pair of users in opposite roles
      // would otherwise grab the same two rows in opposite orders and deadlock —
      // a narrow window at 50 cToons a side, seconds wide at 250.
      const [firstId, secondId] = [offer.initiatorId, offer.recipientId].sort()

      // A user's net can be a decrement even though only pointsRequested (never
      // locked) is driving it, not pointsOffered (locked at creation). The
      // pre-transaction check above confirms the recipient can afford it at
      // that instant, but nothing reserves it — a recipient with two separate
      // PENDING offers whose pointsRequested both fit their balance alone can
      // still accept both in quick succession, and the offer-row claim above
      // only serializes accepts of the SAME offer, not two different offers
      // touching the same UserPoints row. So the decrementing side of this net
      // is a CONDITIONAL update gated on the row still covering it, and a miss
      // aborts the whole transaction (rolling the claim back too) instead of
      // ever letting a balance go negative.
      async function applyNet (userId) {
        const net = netFor(userId)
        if (net >= 0) {
          return tx.userPoints.update({ where: { userId }, data: { points: { increment: net } } })
        }
        const magnitude = -net
        const guarded = await tx.userPoints.updateMany({
          where: { userId, points: { gte: magnitude } },
          data: { points: { decrement: magnitude } }
        })
        if (guarded.count !== 1) {
          throw createError({
            statusCode: 409,
            statusMessage: 'A balance changed and this trade can no longer be completed. Please try again.'
          })
        }
        return tx.userPoints.findUnique({ where: { userId } })
      }

      const firstRow = await applyNet(firstId)
      const secondRow = await applyNet(secondId)
      const totalFor = (userId) => (userId === firstId ? firstRow : secondRow).points

      const logRows = []
      if (offer.pointsOffered > 0) {
        logRows.push(
          {
            userId:    offer.initiatorId,
            points:    offer.pointsOffered,
            total:     totalFor(offer.initiatorId),
            method:    'Requested Trade',
            direction: 'decrease'
          },
          {
            userId:    offer.recipientId,
            points:    offer.pointsOffered,
            total:     totalFor(offer.recipientId),
            method:    'Accepted Trade',
            direction: 'increase'
          }
        )
      }
      if (offer.pointsRequested > 0) {
        logRows.push(
          {
            userId:    offer.recipientId,
            points:    offer.pointsRequested,
            total:     totalFor(offer.recipientId),
            method:    'Accepted Trade (points requested)',
            direction: 'decrease'
          },
          {
            userId:    offer.initiatorId,
            points:    offer.pointsRequested,
            total:     totalFor(offer.initiatorId),
            method:    'Requested Trade (points requested)',
            direction: 'increase'
          }
        )
      }
      await tx.pointsLog.createMany({ data: logRows })

      // Mark the corresponding trade lock as consumed. pointsRequested never
      // had one to begin with (see the schema comment on it), so this stays
      // scoped to pointsOffered exactly as before.
      if (offer.pointsOffered > 0) {
        await tx.lockedPoints.updateMany({
          where: {
            userId: offer.initiatorId,
            status: 'ACTIVE',
            contextType: 'TRADE',
            contextId: offerId
          },
          data: { status: 'CONSUMED' }
        })
      }
    }

    // Transfer both sides as two set-based updates rather than one update per
    // cToon. The per-cToon loop this replaces issued three statements each, so a
    // full-size offer was ~1500 sequential round trips inside this transaction —
    // well past Prisma's default 5s timeout, and a P2028 here rolls back the
    // claim above too, leaving the offer PENDING and permanently unacceptable
    // because every retry times out identically.
    //
    // The guard the loop provided is preserved exactly: each updateMany is still
    // conditional on the expected current owner, so a cToon already moved by a
    // concurrently-accepted offer simply isn't matched, and comparing the
    // aggregate count to the expected length catches that the same way
    // `moved.count !== 1` did per row.
    const transfers = [
      { ids: offeredIds, from: offer.initiatorId, to: offer.recipientId },
      { ids: requestedIds, from: offer.recipientId, to: offer.initiatorId }
    ]

    for (const { ids, from, to } of transfers) {
      if (!ids.length) continue

      const moved = await tx.userCtoon.updateMany({
        where: { id: { in: ids }, userId: from, burnedAt: null },
        data:  { userId: to }
      })
      if (moved.count !== ids.length) {
        throw createError({
          statusCode: 409,
          statusMessage: 'One or more cToons in this trade are no longer available.'
        })
      }

      // A cToon that changed hands can no longer sit on its old owner's trade
      // list. Scoped to the new owner so their own listing survives, matching
      // the per-cToon delete this replaces.
      await tx.userTradeListItem.deleteMany({
        where: { userCtoonId: { in: ids }, userId: { not: to } }
      })
    }

    if (offer.ctoons.length) {
      await tx.ctoonOwnerLog.createMany({
        data: offer.ctoons.map(tc => ({
          userId:      tc.role === 'OFFERED' ? offer.recipientId : offer.initiatorId,
          ctoonId:     tc.userCtoon.ctoonId,
          userCtoonId: tc.userCtoonId,
          mintNumber:  tc.userCtoon.mintNumber,
          method:      'TRADE',
          counterpartyUserId: tc.role === 'OFFERED' ? offer.initiatorId : offer.recipientId,
          counterpartyUsername: tc.role === 'OFFERED' ? initiator.username : me.username
        }))
      })
    }

    // Status was already claimed at the top of this transaction.
  }, {
    // Explicit rather than Prisma's 5s/2s defaults. The work is bounded now, but
    // a max-size offer still moves 500 rows, and the precedent for bulk work in
    // this repo is an explicit budget (see admin/auction-only/index.post.js).
    timeout: 20000,
    maxWait: 10000
  })

  // 7a) In-app notification to the initiator — their sent offer was accepted.
  // Ahead of the DM block below because that block awaits two Discord API calls;
  // this one must not be stuck behind them, and must not be skipped when the
  // user has no Discord id or the bot token is unset.
  notifyTradeOfferAccepted(prisma, {
    userId: offer.initiatorId,
    offerId,
    byUsername: me.username
  }).catch(() => {})

  try {
    // 7b) Notify initiator via Discord DM
    if (initiator?.discordId && process.env.BOT_TOKEN) {
      const BOT_TOKEN = process.env.BOT_TOKEN
      const isProd = process.env.NODE_ENV === 'production'
      const baseUrl = isProd
        ? 'https://www.cartoonreorbit.com/newsite/trade'
        : 'http://localhost:3000/newsite/trade'

      const dmChannel = await $fetch(
        'https://discord.com/api/v10/users/@me/channels',
        {
          method: 'POST',
          headers: {
            'Authorization': `${BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: { recipient_id: initiator.discordId }
        }
      )

      const messageContent = [
        `🎉 **${me.username}** has accepted your trade offer!`,
        ``,
        `🔗 View details: ${baseUrl}`
      ].join('\n')

      await $fetch(
        `https://discord.com/api/v10/channels/${dmChannel.id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `${BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: { content: messageContent }
        }
      )
    }
  } catch {
    // ignore DM failures
  }

  return { success: true }
})
