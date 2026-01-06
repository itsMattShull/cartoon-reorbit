// server/api/admin/trade-offers.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let adminUser
  try {
    adminUser = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!adminUser?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Admins only' })
  }

  // 2) Resolve official account
  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const official = await prisma.user.findUnique({
    where: { username: officialUsername }
  })
  if (!official) {
    throw createError({ statusCode: 400, statusMessage: `Official account not found: ${officialUsername}` })
  }

  // 3) Parse & validate body
  const {
    recipientUsername,
    ctoonIdsRequested = [],
    ctoonIdsOffered = [],
    pointsOffered = 0
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
  if (Number(pointsOffered) > 0) {
    throw createError({ statusCode: 400, statusMessage: 'Points are not supported for admin-initiated trades.' })
  }

  // 4) Lookup recipient & ensure not the official account
  const recipient = await prisma.user.findUnique({
    where: { username: recipientUsername }
  })
  if (!recipient) {
    throw createError({ statusCode: 404, statusMessage: 'Recipient not found' })
  }
  if (recipient.id === official.id) {
    throw createError({ statusCode: 400, statusMessage: 'Self trade not allowed' })
  }
  const recipientDiscordId = recipient.discordId
  if (!recipientDiscordId) {
    console.warn(`Cannot DM ${recipientUsername}: no discordId on record`)
  }

  // 5) Verify ownership of offered cToons (official account)
  if (ctoonIdsOffered.length) {
    const ownedByOfficial = await prisma.userCtoon.findMany({
      where: { id: { in: ctoonIdsOffered }, userId: official.id },
      select: { id: true }
    })
    if (ownedByOfficial.length !== ctoonIdsOffered.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more offered cToons are not owned by the official account or no longer available'
      })
    }
  }

  // 6) Verify ownership of requested cToons (recipient)
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

  // 7) Prevent trades involving cToons in active auctions
  if (ctoonIdsOffered.length) {
    const offeredActiveAuction = await prisma.auction.findFirst({
      where: { userCtoonId: { in: ctoonIdsOffered }, status: 'ACTIVE' },
      select: { id: true }
    })
    if (offeredActiveAuction) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more of the cToons offered is in an active auction.'
      })
    }
  }
  if (ctoonIdsRequested.length) {
    const requestedActiveAuction = await prisma.auction.findFirst({
      where: { userCtoonId: { in: ctoonIdsRequested }, status: 'ACTIVE' },
      select: { id: true }
    })
    if (requestedActiveAuction) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more of the cToons requested is in an active auction.'
      })
    }
  }

  // 8) Create the TradeOffer + nested C-Toon joins
  const offer = await prisma.$transaction(async (tx) => {
    return tx.tradeOffer.create({
      data: {
        initiatorId: official.id,
        recipientId: recipient.id,
        pointsOffered: 0,
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
  })

  try {
    // 9) Send as a DIRECT MESSAGE to the user via their DM channel
    if (recipientDiscordId && process.env.BOT_TOKEN) {
      const BOT_TOKEN = process.env.BOT_TOKEN
      const isProd = process.env.NODE_ENV === 'production'
      const baseUrl = isProd
        ? 'https://www.cartoonreorbit.com/trade-offers'
        : 'http://localhost:3000/trade-offers'

      // 9a) Open (or fetch) a DM channel with that user
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

      // 9b) Post the message into that DM channel
      const messageContent = [
        `Trade offer from ${official.username}`,
        `- cToons offered: ${ctoonIdsOffered.length}`,
        `- cToons requested: ${ctoonIdsRequested.length}`,
        '',
        `View it here: ${baseUrl}`
      ].join('\\n')

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
  }

  return { success: true, offer }
})
