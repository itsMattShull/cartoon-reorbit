// server/api/trade/offers.post.js
// Creates a plain (non-counter) trade offer. Countering an existing offer goes
// through server/api/trade/offers/[id]/counter.post.js, which shares the
// validation and creation helpers in server/utils/tradeOffer.js but keeps its
// own authorization checks structurally unavoidable.
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
  sendTradeOfferDM
} from '@/server/utils/tradeOffer'
import { notifyTradeOfferReceived } from '@/server/utils/notifications'
import { checkTradeOfferRateLimit } from '@/server/utils/tradeOfferRateLimit'

export default defineEventHandler(async (event) => {
  // 1) Authenticate user
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const initiatorId = me?.id
  if (!initiatorId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2) Parse & validate body
  const {
    recipientUsername,
    ctoonIdsRequested = [],
    ctoonIdsOffered = [],
    pointsOffered = 0,
    pointsRequested = 0
  } = await readBody(event)

  if (!recipientUsername || typeof recipientUsername !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'recipientUsername is required' })
  }

  await checkTradeOfferRateLimit(event, initiatorId)

  const { resolvedOffered, resolvedRequested } = await resolveOfferCtoons({
    ctoonIdsOffered,
    ctoonIdsRequested
  })
  assertOfferHasContent({ resolvedOffered, resolvedRequested, pointsOffered, pointsRequested })

  // 3) Lookup recipient
  const recipient = await prisma.user.findUnique({
    where: { username: recipientUsername },
    select: { id: true, username: true, discordId: true }
  })
  if (!recipient) {
    throw createError({ statusCode: 404, statusMessage: 'Recipient not found' })
  }

  // 4) Ownership, availability and funding
  const { existingPendingCount } = await validateTradeOfferInputs({
    initiatorId,
    recipient,
    resolvedOffered,
    resolvedRequested,
    pointsOffered,
    pointsRequested
  })

  // 5) Create the offer and lock the offered points
  const offer = await prisma.$transaction(async (tx) => createTradeOfferTx(tx, {
    initiatorId,
    recipientId: recipient.id,
    pointsOffered,
    pointsRequested,
    resolvedOffered,
    resolvedRequested
  }))

  // 6) Notify the recipient. Not awaited — the offer is already committed and
  // Discord's DM rate limits would otherwise stall the response for seconds.
  // Only on the first pending offer between this pair (existingPendingCount
  // was taken before this one was created) — see validateTradeOfferInputs.
  if (existingPendingCount === 0) {
    sendTradeOfferDM({
      recipientDiscordId: recipient.discordId,
      fromUsername: me.username,
      pointsOffered,
      pointsRequested,
      offeredCount: resolvedOffered.length,
      requestedCount: resolvedRequested.length,
      isCounter: false
    }).catch(() => {})
  }

  // In-app notification, same placement and same reasoning as the DM above:
  // after the commit, not awaited.
  notifyTradeOfferReceived(prisma, {
    userId: recipient.id,
    fromUserId: initiatorId,
    fromUsername: me.username,
    isCounter: false
  }).catch(() => {})

  return { success: true, offer }
})
