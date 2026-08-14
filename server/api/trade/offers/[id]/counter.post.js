// server/api/trade/offers/[id]/counter.post.js
// Replies to an incoming trade offer with a revised one: the original is closed
// out as COUNTERED and the replacement is created in a single transaction.
//
// This is a separate route rather than a flag on offers.post.js on purpose. The
// counter path needs an authorization rule that only the original's RECIPIENT
// may counter it; hanging that off an optional body field on the general create
// endpoint would mean one missed branch turns "create an offer" into "close any
// offer whose id you happen to know".
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'
import {
  resolveOfferCtoons,
  validateTradeOfferInputs,
  createTradeOfferTx,
  assertOfferHasContent,
  counterAuthorizationError,
  counterChainDepth,
  exceedsCounterChainDepth,
  sendTradeOfferDM,
  isUuid,
  MAX_COUNTER_CHAIN_DEPTH
} from '@/server/utils/tradeOffer'
import { notifyTradeOfferReceived } from '@/server/utils/notifications'

/// One response for every "you may not counter this" case. Distinguishing
/// "no such offer" from "not yours" from "already settled" would make this
/// endpoint an existence oracle for other users' offer ids.
function notCounterable () {
  return createError({ statusCode: 404, statusMessage: 'Offer not found or no longer pending.' })
}

export default defineEventHandler(async (event) => {
  // 1) Authenticate
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const callerId = me?.id
  if (!callerId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // 2) Validate the route param before it reaches Prisma, which would otherwise
  // throw a 500 on a non-UUID.
  const originalId = event.context.params.id
  if (!isUuid(originalId)) throw notCounterable()

  const {
    ctoonIdsRequested = [],
    ctoonIdsOffered = [],
    pointsOffered = 0
  } = await readBody(event)

  // 3) Load the offer being countered
  const original = await prisma.tradeOffer.findUnique({
    where: { id: originalId },
    select: {
      id: true,
      status: true,
      initiatorId: true,
      recipientId: true,
      initiator: { select: { id: true, username: true, discordId: true } }
    }
  })

  // The counter always goes back to whoever sent the original — the client does
  // not get to name a recipient, which removes any chance of redirecting a
  // countered trade to a third party.
  const authError = counterAuthorizationError({
    original,
    callerId,
    newRecipientId: original?.initiatorId
  })
  if (authError) throw notCounterable()

  const recipient = original.initiator

  const depth = await counterChainDepth(originalId, MAX_COUNTER_CHAIN_DEPTH)
  if (exceedsCounterChainDepth(depth)) {
    throw createError({
      statusCode: 400,
      statusMessage: `This negotiation has reached the limit of ${MAX_COUNTER_CHAIN_DEPTH} counters. Start a new trade instead.`
    })
  }

  const { resolvedOffered, resolvedRequested } = await resolveOfferCtoons({
    ctoonIdsOffered,
    ctoonIdsRequested
  })
  assertOfferHasContent({ resolvedOffered, resolvedRequested, pointsOffered })

  // 4) Ownership, availability and funding.
  //
  // excludeOfferIds is what makes a counter possible at all: a counter re-uses
  // the very cToons committed to the offer it replaces, which the pending-trade
  // guard would otherwise reject. The exemption is scoped to this one offer, so
  // a cToon that is ALSO in some unrelated pending offer still fails.
  await validateTradeOfferInputs({
    initiatorId: callerId,
    recipient,
    resolvedOffered,
    resolvedRequested,
    pointsOffered,
    excludeOfferIds: [original.id]
  })

  // 5) Close out the original and create the counter atomically.
  const offer = await prisma.$transaction(async (tx) => {
    // Claim the original first. Same ordering as accept.post.js and
    // reject.post.js, so concurrent transitions block rather than deadlock, and
    // count !== 1 means somebody else settled it while we were validating.
    const claimed = await tx.tradeOffer.updateMany({
      where: { id: original.id, status: 'PENDING' },
      data: { status: 'COUNTERED', updatedAt: new Date() }
    })
    if (claimed.count !== 1) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This offer was just accepted or withdrawn, so it can no longer be countered.'
      })
    }

    // Release the ORIGINAL INITIATOR's lock — the counterer never had one.
    // Scoped by their user id and the loaded offer's id, never by anything from
    // the request body. The ACTIVE filter is what stops this un-consuming a
    // lock that an accept already spent.
    await tx.lockedPoints.updateMany({
      where: {
        userId: original.initiatorId,
        status: 'ACTIVE',
        contextType: 'TRADE',
        contextId: original.id
      },
      data: { status: 'RELEASED' }
    })

    return createTradeOfferTx(tx, {
      initiatorId: callerId,
      recipientId: recipient.id,
      pointsOffered,
      resolvedOffered,
      resolvedRequested,
      counteredOfferId: original.id
    })
  })

  // 6) One DM, with counter wording. Not awaited, and reject.post.js is
  // deliberately never involved — otherwise the other party would get both a
  // "rejected your offer" and a "countered your offer" message.
  sendTradeOfferDM({
    recipientDiscordId: recipient.discordId,
    fromUsername: me.username,
    pointsOffered,
    offeredCount: resolvedOffered.length,
    requestedCount: resolvedRequested.length,
    isCounter: true
  }).catch(() => {})

  // Exactly one in-app notification too, mirroring the DM rule above. The
  // countered party IS this recipient — emitting a separate "your offer was
  // countered" alongside this would re-introduce the double-notification the
  // comment above exists to prevent.
  notifyTradeOfferReceived(prisma, {
    userId: recipient.id,
    fromUserId: callerId,
    fromUsername: me.username,
    isCounter: true
  }).catch(() => {})

  return { success: true, offer }
})
