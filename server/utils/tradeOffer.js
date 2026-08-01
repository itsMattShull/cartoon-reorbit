// server/utils/tradeOffer.js
// Database-touching half of the trade-offer logic shared by the create path
// (server/api/trade/offers.post.js) and the counter path
// (server/api/trade/offers/[id]/counter.post.js).
//
// The pure decision logic lives in server/utils/tradeOfferRules.js so it can be
// unit-tested without a database; this module composes it with Prisma.
import { createError } from 'h3'
import { prisma } from '@/server/prisma'
import { resolveUserCtoonId } from '@/server/utils/userCtoonId'
import {
  normalizeCtoonIdList,
  assertNoCrossSideOverlap,
  pendingTradeGuardWhere,
  fmtPoints
} from '@/server/utils/tradeOfferRules'

export * from '@/server/utils/tradeOfferRules'

/**
 * Resolves both sides' cToon references (raw UUIDs or synthetic `uc|…` tokens)
 * to real UserCtoon ids. Returns { resolvedOffered, resolvedRequested }.
 */
export async function resolveOfferCtoons ({ ctoonIdsOffered, ctoonIdsRequested }) {
  const offered = normalizeCtoonIdList(ctoonIdsOffered, 'ctoonIdsOffered')
  const requested = normalizeCtoonIdList(ctoonIdsRequested, 'ctoonIdsRequested')

  const [resolvedOffered, resolvedRequested] = await Promise.all([
    Promise.all(offered.map(resolveUserCtoonId)),
    Promise.all(requested.map(resolveUserCtoonId))
  ])

  if (resolvedOffered.some(id => !id) || resolvedRequested.some(id => !id)) {
    throw createError({ statusCode: 400, statusMessage: 'One or more invalid cToon references' })
  }
  assertNoCrossSideOverlap(resolvedOffered, resolvedRequested)
  return { resolvedOffered, resolvedRequested }
}

/**
 * Every ownership / availability / funding check that must pass before an offer
 * may be created. Throws createError on the first failure.
 *
 * `excludeOfferIds` exempts offers that are being closed out in the same
 * transaction that creates the new offer — i.e. the offer being countered.
 */
export async function validateTradeOfferInputs ({
  initiatorId,
  recipient,
  resolvedOffered,
  resolvedRequested,
  pointsOffered,
  excludeOfferIds = []
}) {
  if (typeof pointsOffered !== 'number' || !Number.isInteger(pointsOffered) || pointsOffered < 0) {
    throw createError({ statusCode: 400, statusMessage: 'pointsOffered must be a non-negative integer' })
  }
  // Only the client blocked self-trades. Server-side they would make the points
  // release and re-lock in the counter transaction operate on one balance, where
  // the release is visible to the availability check that follows it.
  if (recipient.id === initiatorId) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot trade with yourself.' })
  }

  const allIds = [...resolvedOffered, ...resolvedRequested]

  // Ownership for both sides in one query, partitioned by owner afterwards.
  const owned = allIds.length
    ? await prisma.userCtoon.findMany({
        where: { id: { in: allIds }, burnedAt: null },
        select: { id: true, userId: true }
      })
    : []
  const ownerById = new Map(owned.map(r => [r.id, r.userId]))

  if (resolvedOffered.some(id => ownerById.get(id) !== initiatorId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'One or more offered cToons are not owned by you or no longer available'
    })
  }
  if (resolvedRequested.some(id => ownerById.get(id) !== recipient.id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'One or more requested cToons are not owned by the recipient or no longer available'
    })
  }

  if (allIds.length) {
    const [inPendingTrade, inAuction] = await Promise.all([
      prisma.tradeOfferCtoon.findFirst({
        where: pendingTradeGuardWhere(allIds, excludeOfferIds),
        select: { userCtoonId: true }
      }),
      prisma.auction.findFirst({
        where: { userCtoonId: { in: allIds }, status: 'ACTIVE' },
        select: { userCtoonId: true }
      })
    ])
    // Deliberately generic. Naming the cToon and whose it was made this an
    // oracle for another user's holdings and pending-trade state.
    if (inPendingTrade) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more cToons in this trade are already part of a pending trade.'
      })
    }
    if (inAuction) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more cToons in this trade are currently in an active auction.'
      })
    }
  }

  if (pointsOffered > 0) {
    const [pts, locks] = await Promise.all([
      prisma.userPoints.findUnique({ where: { userId: initiatorId }, select: { points: true } }),
      prisma.lockedPoints.findMany({
        where: { userId: initiatorId, status: 'ACTIVE' },
        select: { amount: true }
      })
    ])
    const totalPoints = pts?.points ?? 0
    const lockedSum = locks.reduce((acc, r) => acc + (r.amount || 0), 0)
    if (pointsOffered > totalPoints - lockedSum) {
      throw createError({
        statusCode: 400,
        statusMessage: `Insufficient points: you have ${fmtPoints(totalPoints)} points, with ${fmtPoints(lockedSum)} locked; tried to offer ${fmtPoints(pointsOffered)}.`
      })
    }
  }
}

/**
 * Creates the offer and locks the offered points inside a caller-supplied
 * transaction, re-verifying available points to close the window between the
 * pre-flight check and the commit.
 */
export async function createTradeOfferTx (tx, {
  initiatorId,
  recipientId,
  pointsOffered,
  resolvedOffered,
  resolvedRequested,
  counteredOfferId = null
}) {
  if (pointsOffered > 0) {
    const ptsNow = await tx.userPoints.findUnique({
      where: { userId: initiatorId },
      select: { points: true }
    })
    const locksNow = await tx.lockedPoints.findMany({
      where: { userId: initiatorId, status: 'ACTIVE' },
      select: { amount: true }
    })
    const lockedNow = locksNow.reduce((acc, r) => acc + (r.amount || 0), 0)
    if (pointsOffered > (ptsNow?.points ?? 0) - lockedNow) {
      throw createError({
        statusCode: 400,
        statusMessage: `Insufficient points: you have ${fmtPoints(ptsNow?.points ?? 0)} points, with ${fmtPoints(lockedNow)} locked; tried to offer ${fmtPoints(pointsOffered)}.`
      })
    }
  }

  // No `include` here on purpose: hydrating the nested cToons forces an extra
  // SELECT inside the transaction, lengthening the lock window, and no caller
  // uses the result.
  const created = await tx.tradeOffer.create({
    data: {
      initiatorId,
      recipientId,
      pointsOffered,
      counteredOfferId,
      ctoons: {
        create: [
          ...resolvedOffered.map(id => ({ userCtoonId: id, role: 'OFFERED' })),
          ...resolvedRequested.map(id => ({ userCtoonId: id, role: 'REQUESTED' }))
        ]
      }
    },
    select: { id: true, status: true, createdAt: true, counteredOfferId: true }
  })

  if (pointsOffered > 0) {
    await tx.lockedPoints.create({
      data: {
        userId: initiatorId,
        amount: pointsOffered,
        reason: 'TRADE_OFFER',
        status: 'ACTIVE',
        contextType: 'TRADE',
        contextId: created.id
      }
    })
  }
  return created
}

/**
 * How many counters deep a negotiation already is, by walking the lineage.
 * Bounded by MAX_COUNTER_CHAIN_DEPTH so a cycle (which the unique constraint
 * should make impossible) can never spin here.
 */
export async function counterChainDepth (offerId, max) {
  let depth = 0
  let cursor = offerId
  while (cursor && depth < max) {
    const row = await prisma.tradeOffer.findUnique({
      where: { id: cursor },
      select: { counteredOfferId: true }
    })
    if (!row?.counteredOfferId) break
    cursor = row.counteredOfferId
    depth++
  }
  return depth
}

/**
 * Discord DM telling the recipient about a new offer or a counter.
 *
 * Callers must not await this. The offer is already committed by the time it
 * runs, nothing downstream depends on it, and Discord rate-limits DM-channel
 * creation hard enough to stall the response for seconds — which is exactly what
 * a back-and-forth negotiation would trigger.
 */
export async function sendTradeOfferDM ({
  recipientDiscordId,
  fromUsername,
  pointsOffered,
  offeredCount,
  requestedCount,
  isCounter = false
}) {
  if (!recipientDiscordId || !process.env.BOT_TOKEN) return
  const BOT_TOKEN = process.env.BOT_TOKEN
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://www.cartoonreorbit.com/newsite/trade'
    : 'http://localhost:3000/newsite/trade'

  const dmChannel = await $fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: { Authorization: `${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: { recipient_id: recipientDiscordId }
  })

  const messageContent = [
    isCounter
      ? `🔄 **${fromUsername}** has countered your trade offer!`
      : `👋 **${fromUsername}** has sent you a trade offer!`,
    `• Points offered: **${pointsOffered}**`,
    `• cToons offered: **${offeredCount}**`,
    `• cToons requested: **${requestedCount}**`,
    ``,
    `🔗 View it here: ${baseUrl}`
  ].join('\n')

  await $fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
    method: 'POST',
    headers: { Authorization: `${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: { content: messageContent }
  })
}
