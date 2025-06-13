// server/api/trade/offers/[id]/reject.post.js
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

  try {
    // 6) Notify the other party via Discord DM
    const targetUserId = userId === offer.recipientId
      ? offer.initiatorId   // recipient rejected → notify initiator
      : offer.recipientId   // initiator cancelled → notify recipient

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { discordId: true, username: true }
    })

    if (target?.discordId && process.env.BOT_TOKEN) {
      const BOT_TOKEN = process.env.BOT_TOKEN
      const isProd = process.env.NODE_ENV === 'production'
      const baseUrl = isProd
        ? 'https://www.cartoonreorbit.com/trade-offers'
        : 'http://localhost:3000/trade-offers'

      // open or fetch DM channel
      const dmChannel = await $fetch(
        'https://discord.com/api/v10/users/@me/channels',
        {
          method: 'POST',
          headers: {
            'Authorization': `${BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: { recipient_id: target.discordId }
        }
      )

      // determine wording
      const action = userId === offer.recipientId ? 'rejected' : 'cancelled'
      const emoji = '❌'
      const messageContent = [
        `${emoji} **${me.username}** has ${action} your trade offer.`,
        ``,
        `🔗 View it here: ${baseUrl}`
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
  } catch (err) {
    // console.error('Failed to send rejection DM:', err)
    // optionally report to an error-tracker here
  }

  return { success: true }
})
