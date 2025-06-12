// server/api/trade/offers/[id]/reject.post.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  // 2) Load the offer
  const offerId = event.context.params.id
  const offer = await prisma.tradeOffer.findUnique({
    where: { id: offerId }
  })
  if (!offer) {
    throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  }

  // 3) Authorization
  if (![offer.recipientId, offer.initiatorId].includes(userId)) {
    throw createError({ statusCode: 403, statusMessage: 'Cannot reject this offer' })
  }

  // 4) Status check
  if (offer.status !== 'PENDING') {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot reject: offer status is already '${offer.status.toLowerCase()}'.`
    })
  }

  // 5) Reject the offer
  await prisma.tradeOffer.update({
    where: { id: offerId },
    data: { status: 'REJECTED', updatedAt: new Date() }
  })

  return { success: true }
})
