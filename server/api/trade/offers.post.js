// server/api/trade/offers.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const fmt = (n) => Number(n || 0).toLocaleString('en-US')
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
  if (typeof pointsOffered !== 'number' || !Number.isInteger(pointsOffered) || pointsOffered < 0) {
    throw createError({ statusCode: 400, statusMessage: 'pointsOffered must be a non-negative integer' })
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

  // 4–6) All validation and offer creation happen atomically inside a transaction
  // to prevent TOCTOU races (ownership, pending trades, auctions, and points can
  // all change between a pre-check and the write).
  const offer = await prisma.$transaction(async (tx) => {
    // 4) Verify ownership of offered cToons
    if (ctoonIdsOffered.length) {
      const ownedCount = await tx.userCtoon.count({
        where: { id: { in: ctoonIdsOffered }, userId: initiatorId, burnedAt: null }
      })
      if (ownedCount !== ctoonIdsOffered.length) {
        throw createError({
          statusCode: 400,
          statusMessage: 'One or more offered cToons are not owned by you or no longer available'
        })
      }

      // 4a) Check offered cToons are not in any pending trades
      const offeredInPendingTrade = await tx.tradeOfferCtoon.findFirst({
        where: {
          userCtoonId: { in: ctoonIdsOffered },
          tradeOffer: { status: 'PENDING' }
        },
        include: {
          userCtoon: { include: { ctoon: { select: { name: true } } } }
        }
      })
      if (offeredInPendingTrade) {
        const ctoonName = offeredInPendingTrade.userCtoon?.ctoon?.name || 'Unknown cToon'
        throw createError({
          statusCode: 400,
          statusMessage: `Your cToon "${ctoonName}" is already part of a pending trade and cannot be offered.`
        })
      }

      // 4b) Check offered cToons are not in active auctions
      const offeredActiveAuction = await tx.auction.findFirst({
        where: { userCtoonId: { in: ctoonIdsOffered }, status: 'ACTIVE' },
        include: { userCtoon: { include: { ctoon: { select: { name: true } } } } }
      })
      if (offeredActiveAuction) {
        const ctoonName = offeredActiveAuction.userCtoon?.ctoon?.name || 'Unknown cToon'
        throw createError({
          statusCode: 400,
          statusMessage: `Your cToon "${ctoonName}" is currently in an active auction and cannot be offered.`
        })
      }
    }

    // 4c) Verify initiator has enough AVAILABLE points (total - active locks)
    if (pointsOffered > 0) {
      const pts = await tx.userPoints.findUnique({
        where: { userId: initiatorId },
        select: { points: true }
      })
      const lockAgg = await tx.lockedPoints.aggregate({
        where: { userId: initiatorId, status: 'ACTIVE' },
        _sum: { amount: true }
      })
      const totalPoints = pts?.points ?? 0
      const lockedSum = lockAgg._sum.amount ?? 0
      const availablePoints = totalPoints - lockedSum
      if (pointsOffered > availablePoints) {
        throw createError({
          statusCode: 400,
          statusMessage: `Insufficient points: you have ${fmt(totalPoints)} points, with ${fmt(lockedSum)} locked; tried to offer ${fmt(pointsOffered)}.`
        })
      }
    }

    // 5) Verify ownership of requested cToons
    if (ctoonIdsRequested.length) {
      const ownedCount = await tx.userCtoon.count({
        where: { id: { in: ctoonIdsRequested }, userId: recipient.id, burnedAt: null }
      })
      if (ownedCount !== ctoonIdsRequested.length) {
        throw createError({
          statusCode: 400,
          statusMessage: 'One or more requested cToons are not owned by the recipient or no longer available'
        })
      }

      // 5a) Check requested cToons are not in any pending trades
      const requestedInPendingTrade = await tx.tradeOfferCtoon.findFirst({
        where: {
          userCtoonId: { in: ctoonIdsRequested },
          tradeOffer: { status: 'PENDING' }
        },
        include: {
          userCtoon: { include: { ctoon: { select: { name: true } } } }
        }
      })
      if (requestedInPendingTrade) {
        const ctoonName = requestedInPendingTrade.userCtoon?.ctoon?.name || 'Unknown cToon'
        throw createError({
          statusCode: 400,
          statusMessage: `${recipient.username}'s cToon "${ctoonName}" is already part of a pending trade and cannot be requested.`
        })
      }

      // 5b) Check requested cToons are not in active auctions
      const requestedActiveAuction = await tx.auction.findFirst({
        where: { userCtoonId: { in: ctoonIdsRequested }, status: 'ACTIVE' },
        include: { userCtoon: { include: { ctoon: { select: { name: true } } } } }
      })
      if (requestedActiveAuction) {
        const ctoonName = requestedActiveAuction.userCtoon?.ctoon?.name || 'Unknown cToon'
        throw createError({
          statusCode: 400,
          statusMessage: `${recipient.username}'s cToon "${ctoonName}" is currently in an active auction and cannot be requested.`
        })
      }
    }

    // 6) Create the TradeOffer + nested C-Toon joins AND lock the offered points
    const created = await tx.tradeOffer.create({
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
