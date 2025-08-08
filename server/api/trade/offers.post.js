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

  // 2) Parse & validate body
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

  // 3) Lookup recipient & ensure they have a Discord ID
  const recipient = await prisma.user.findUnique({
    where: { username: recipientUsername }
  })
  if (!recipient) {
    throw createError({ statusCode: 404, statusMessage: 'Recipient not found' })
  }
  const recipientDiscordId = recipient.discordId
  if (!recipientDiscordId) {
    console.warn(`Cannot DM ${recipientUsername}: no discordId on record`)
  }

  // 4) Verify ownership of offered cToons
  if (ctoonIdsOffered.length) {
    const ownedByInitiator = await prisma.userCtoon.findMany({
      where: { id: { in: ctoonIdsOffered }, userId: initiatorId },
      select: { id: true }
    })
    if (ownedByInitiator.length !== ctoonIdsOffered.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more offered cToons are not owned by you or no longer available'
      })
    }
  }

  // 4) Verify initiator has enough points
  const initiator = await prisma.user.findUnique({
    where: { id: initiatorId },
    select: { points: { select: { points: true } } } // UserPoints relation
  })
  const initiatorBalance = initiator?.points?.points ?? 0

  if (pointsOffered > initiatorBalance) {
    throw createError({
      statusCode: 400,
      statusMessage: `Insufficient points: you have ${initiatorBalance} but tried to offer ${pointsOffered}`
    })
  }

  // 5) Verify ownership of requested cToons
  if (ctoonIdsRequested.length) {
    const ownedByRecipient = await prisma.userCtoon.findMany({
      where: { id: { in: ctoonIdsRequested }, userId: recipient.id },
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
          ...ctoonIdsOffered.map(id => ({ userCtoonId: id, role: 'OFFERED' })),
          ...ctoonIdsRequested.map(id => ({ userCtoonId: id, role: 'REQUESTED' }))
        ]
      }
    },
    include: {
      ctoons: { include: { userCtoon: true } }
    }
  })

  try {
    // 7) Send as a DIRECT MESSAGE to the user via their DM channel
    if (recipientDiscordId && process.env.BOT_TOKEN) {
      const BOT_TOKEN = process.env.BOT_TOKEN
      const isProd = process.env.NODE_ENV === 'production'
      const baseUrl = isProd
        ? 'https://www.cartoonreorbit.com/trade-offers'
        : 'http://localhost:3000/trade-offers'

      // 7a) Open (or fetch) a DM channel with that user
      const dmChannel = await $fetch(
        'https://discord.com/api/v10/users/@me/channels',
        {
          method: 'POST',
          headers: {
            'Authorization': `${BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: { recipient_id: recipientDiscordId }
        }
      )

      // 7b) Post the message into that DM channel
      const messageContent = [
        `👋 **${me.username}** has sent you a trade offer!`,
        `• Points offered: **${pointsOffered}**`,
        `• cToons offered: **${ctoonIdsOffered.length}**`,
        `• cToons requested: **${ctoonIdsRequested.length}**`,
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
    // console.error('Failed to send offer DM:', err)
    // optionally report to an error-tracker here
  }

  return { success: true, offer }
})
