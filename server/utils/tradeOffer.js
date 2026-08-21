// server/utils/tradeOffer.js
// Database-touching half of the trade-offer logic shared by the create path
// (server/api/trade/offers.post.js) and the counter path
// (server/api/trade/offers/[id]/counter.post.js).
//
// The pure decision logic lives in server/utils/tradeOfferRules.js so it can be
// unit-tested without a database; this module composes it with Prisma.
import { createError } from 'h3'
import { prisma } from '@/server/prisma'
import { resolveUserCtoonIds } from '@/server/utils/userCtoonId'
import {
  normalizeCtoonIdList,
  assertNoCrossSideOverlap,
  pendingTradeGuardWhere,
  assertValidPointsAmount,
  pendingOfferPairLimitExceeded,
  MAX_PENDING_OFFERS_PER_PAIR,
  fmtPoints
} from '@/server/utils/tradeOfferRules'
import {
  lockedRequestedIds,
  UNAVAILABLE_REQUEST_MESSAGE
} from '@/server/utils/lockRules'

export * from '@/server/utils/tradeOfferRules'

/**
 * Two references on one side that resolve to the same physical cToon.
 *
 * normalizeCtoonIdList dedupes the reference STRINGS, which cannot catch this:
 * a raw UUID and the synthetic `uc|…` token naming the same UserCtoon are two
 * different strings that survive the Set and resolve to one id. Left alone they
 * reach createTradeOfferTx as two rows with the same (tradeOfferId, userCtoonId,
 * role), which violates the unique constraint and rolls the whole transaction
 * back with an opaque P2002 — after every insert and lock has been taken.
 *
 * Rejected rather than silently collapsed: dropping one quietly would change
 * what the user is told they offered.
 */
function assertNoDuplicateResolution (resolved, label) {
  if (new Set(resolved).size !== resolved.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} names the same cToon more than once`
    })
  }
}

/**
 * Resolves both sides' cToon references (raw UUIDs or synthetic `uc|…` tokens)
 * to real UserCtoon ids. Returns { resolvedOffered, resolvedRequested }.
 *
 * One batched query per side rather than one per reference — see
 * resolveUserCtoonIds. The returned arrays stay positionally aligned with their
 * inputs, which is what makes the null check below meaningful.
 */
export async function resolveOfferCtoons ({ ctoonIdsOffered, ctoonIdsRequested }) {
  const offered = normalizeCtoonIdList(ctoonIdsOffered, 'ctoonIdsOffered')
  const requested = normalizeCtoonIdList(ctoonIdsRequested, 'ctoonIdsRequested')

  const [resolvedOffered, resolvedRequested] = await Promise.all([
    resolveUserCtoonIds(offered),
    resolveUserCtoonIds(requested)
  ])

  if (resolvedOffered.some(id => !id) || resolvedRequested.some(id => !id)) {
    throw createError({ statusCode: 400, statusMessage: 'One or more invalid cToon references' })
  }
  assertNoDuplicateResolution(resolvedOffered, 'ctoonIdsOffered')
  assertNoDuplicateResolution(resolvedRequested, 'ctoonIdsRequested')
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
  pointsRequested = 0,
  excludeOfferIds = []
}) {
  assertValidPointsAmount(pointsOffered, 'pointsOffered')
  // Deliberately the same shape of check as pointsOffered, and deliberately NOT
  // a balance check — nothing here (or anywhere else in this function) ever
  // queries the RECIPIENT's UserPoints/LockedPoints for this field. That is
  // what keeps the initiator from using a request as a way to fish for how
  // many points someone else has: whether this call succeeds or fails never
  // depends on the recipient's balance. See accept.post.js for the funds check
  // this defers to accept time instead.
  assertValidPointsAmount(pointsRequested, 'pointsRequested')

  // Only the client blocked self-trades. Server-side they would make the points
  // release and re-lock in the counter transaction operate on one balance, where
  // the release is visible to the availability check that follows it.
  if (recipient.id === initiatorId) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot trade with yourself.' })
  }

  // A points-request offer locks nothing and costs the sender no cToon, so it
  // is free to send — the one thing standing between that and an unbounded,
  // attacker-writable incoming list is a cap on how many of these one pair can
  // have open at once. Counters aren't exempted: a counter chain alternates
  // direction each hop, so at most one PENDING offer ever exists for a given
  // (initiator, recipient) ordering within a single chain — this only ever
  // fires against OTHER, unrelated pending offers between the same two users.
  const existingPendingCount = await prisma.tradeOffer.count({
    where: { initiatorId, recipientId: recipient.id, status: 'PENDING' }
  })
  if (pendingOfferPairLimitExceeded(existingPendingCount)) {
    throw createError({
      statusCode: 400,
      statusMessage: `You already have ${MAX_PENDING_OFFERS_PER_PAIR} pending offers to this user. Wait for a response, or withdraw one first.`
    })
  }

  const allIds = [...resolvedOffered, ...resolvedRequested]

  // Ownership for both sides in one query, partitioned by owner afterwards.
  // lockedByUserId rides along in a select this query already runs, and the
  // scan already visits the heap for every row (userId/burnedAt are not in the
  // primary key index), so the extra column costs no I/O and no round trip.
  //
  // isTradeable was never checked here. The invariant "isTradeable = false means
  // untradeable" was enforced only by read-path filtering — /api/collection/:username
  // hides those copies — but nothing makes a client pick from what the UI showed:
  // resolveUserCtoonIds passes a raw UUID straight through, and the `uc|…` token is
  // documented as unsigned and forgeable. So a copy escrowed for a forced dissolve
  // auction, or locked by a holiday redemption, could be named directly and traded
  // out from under the process that was about to claim it. Filtering here rather
  // than checking after means a non-tradeable copy simply falls out of `owned` and
  // hits the existing "not owned by you or no longer available" rejection, which
  // already says exactly that.
  const owned = allIds.length
    ? await prisma.userCtoon.findMany({
        where: { id: { in: allIds }, burnedAt: null, isTradeable: true },
        select: { id: true, userId: true, lockedByUserId: true }
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

  // Locks, after the ownership checks above and before the round trips below.
  //
  // After ownership on purpose: checking first would answer "is this copy
  // locked?" for a cToon belonging to somebody who is not even party to the
  // trade, which is exactly the oracle the generic messages here exist to avoid.
  // Before the Promise.all so a rejection skips two queries.
  //
  // Only the REQUESTED side is checked. A lock stops other people asking for
  // the copy; it never stops the owner offering it themselves, which is why
  // resolvedOffered is not consulted.
  if (resolvedRequested.length) {
    const exemptIds = excludeOfferIds.length
      ? (await prisma.tradeOfferCtoon.findMany({
          where: { tradeOfferId: { in: [...excludeOfferIds] }, userCtoonId: { in: resolvedRequested } },
          select: { userCtoonId: true }
        })).map(r => r.userCtoonId)
      : []

    if (lockedRequestedIds(owned, resolvedRequested, exemptIds).length) {
      // Same generic wording as the guards below, and it must never say the word
      // "lock": the read paths collapse locked/pending/auctioned into one
      // `unavailable` flag precisely so the three cannot be told apart, and a
      // specific message here would undo that in one line.
      throw createError({ statusCode: 400, statusMessage: UNAVAILABLE_REQUEST_MESSAGE })
    }
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

  // Handed back so callers can decide whether to send a DM/notification: only
  // on the first pending offer between this pair, so a sender who already has
  // one open can't ring a recipient's phone again by sending 20 more.
  return { existingPendingCount }
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
  pointsRequested = 0,
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
      // No LockedPoints row for this one, ever — see the schema comment on
      // TradeOffer.pointsRequested. The recipient's balance is checked for the
      // first time at accept.post.js, not here.
      pointsRequested,
      counteredOfferId,
      // createMany, not create: a nested `create` array emits one INSERT per
      // element, so a full-size offer would be 500 statements inside this
      // transaction instead of one.
      ctoons: {
        createMany: {
          data: [
            ...resolvedOffered.map(id => ({ userCtoonId: id, role: 'OFFERED' })),
            ...resolvedRequested.map(id => ({ userCtoonId: id, role: 'REQUESTED' }))
          ]
        }
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
  pointsRequested = 0,
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
    // Only shown when nonzero: a bare "Points requested: 0" line on every DM
    // would bury the (usually rare) offers that actually ask for points.
    ...(pointsRequested > 0 ? [`• Points requested: **${pointsRequested}**`] : []),
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
