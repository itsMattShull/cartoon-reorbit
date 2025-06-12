// server/api/trade/offers.post.js
import { 
  defineEventHandler, 
  readBody, 
  getRequestHeader, 
  createError 
} from 'h3'
import { prisma } from '@/server/prisma'

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

  // 2) Parse & validate body (was getBody → now readBody)
  const {
    recipientUsername,
    ctoonIdsRequested = [],
    ctoonIdsOffered   = [],
    pointsOffered     = 0
  } = await readBody(event)

  if (!recipientUsername) {
    throw createError({ statusCode: 400, statusMessage: 'recipientUsername is required' })
  }
  if (!Array.isArray(ctoonIdsRequested) || !Array.isArray(ctoonIdsOffered)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ctoonIdsRequested and ctoonIdsOffered must be arrays'
    })
  }

  // 3) Lookup recipient
  const recipient = await prisma.user.findUnique({
    where: { username: recipientUsername }
  })
  if (!recipient) {
    throw createError({ statusCode: 404, statusMessage: 'Recipient not found' })
  }

  // 4) Verify ownership of offered cToons
  if (ctoonIdsOffered.length) {
    const ownedByInitiator = await prisma.userCtoon.findMany({
      where: {
        id:   { in: ctoonIdsOffered },
        userId: initiatorId
      },
      select: { id: true }
    })
    if (ownedByInitiator.length !== ctoonIdsOffered.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more offered cToons are not owned by you or no longer available'
      })
    }
  }

  // 5) Verify ownership of requested cToons
  if (ctoonIdsRequested.length) {
    const ownedByRecipient = await prisma.userCtoon.findMany({
      where: {
        id:   { in: ctoonIdsRequested },
        userId: recipient.id
      },
      select: { id: true }
    })
    if (ownedByRecipient.length !== ctoonIdsRequested.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more requested cToons are not owned by the recipient or no longer available'
      })
    }
  }

  // 6) Create the TradeOffer + nested C-Toon joins
  const offer = await prisma.tradeOffer.create({
    data: {
      initiatorId,
      recipientId:   recipient.id,
      pointsOffered,
      ctoons: {
        create: [
          ...ctoonIdsOffered.map(id => ({
            userCtoonId: id,
            role: 'OFFERED'
          })),
          ...ctoonIdsRequested.map(id => ({
            userCtoonId: id,
            role: 'REQUESTED'
          }))
        ]
      }
    },
    include: {
      ctoons: { include: { userCtoon: true } }
    }
  })

  return { success: true, offer }
})
