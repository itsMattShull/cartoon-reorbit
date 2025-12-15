import {
  defineEventHandler,
  getRequestHeader,
  createError
} from 'h3'
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

  // 6) Transfer cToons, move points, log, accept
  await prisma.$transaction(async (tx) => {
    if (offer.pointsOffered > 0) {
      const initiatorPoints = await tx.userPoints.update({
        where: { userId: offer.initiatorId },
        data:  { points: { decrement: offer.pointsOffered } }
      })
      await tx.pointsLog.create({
        data: {
          userId:    offer.initiatorId,
          points:    offer.pointsOffered,
          total:     initiatorPoints.points,
          method:    'Requested Trade',
          direction: 'decrease'
        }
      })

      // Mark the corresponding trade lock as consumed
      await tx.lockedPoints.updateMany({
        where: {
          userId: offer.initiatorId,
          status: 'ACTIVE',
          contextType: 'TRADE',
          contextId: offerId
        },
        data: { status: 'CONSUMED' }
      })

      const recipientPoints = await tx.userPoints.update({
        where: { userId: offer.recipientId },
        data:  { points: { increment: offer.pointsOffered } }
      })
      await tx.pointsLog.create({
        data: {
          userId:    offer.recipientId,
          points:    offer.pointsOffered,
          total:     recipientPoints.points,
          method:    'Accepted Trade',
          direction: 'increase'
        }
      })
    }

    // transfer each cToon to its new owner and log ownership
    for (const tc of offer.ctoons) {
      const newOwner = tc.role === 'OFFERED'
        ? offer.recipientId
        : offer.initiatorId

      const updatedUC = await tx.userCtoon.update({
        where: { id: tc.userCtoonId },
        data:  { userId: newOwner }
      })

      await tx.ctoonOwnerLog.create({
        data: {
          userId:      newOwner,
          ctoonId:     updatedUC.ctoonId,
          userCtoonId: updatedUC.id,
          mintNumber:  updatedUC.mintNumber
        }
      })
    }

    await tx.tradeOffer.update({
      where: { id: offerId },
      data:  { status: 'ACCEPTED' }
    })
  })

  try {
    // 7) Notify initiator via Discord DM
    if (initiator?.discordId && process.env.BOT_TOKEN) {
      const BOT_TOKEN = process.env.BOT_TOKEN
      const isProd = process.env.NODE_ENV === 'production'
      const baseUrl = isProd
        ? 'https://www.cartoonreorbit.com/trade-offers'
        : 'http://localhost:3000/trade-offers'

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
