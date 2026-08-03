import {
  defineEventHandler,
  getRequestHeader,
  readBody,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'
import { useRuntimeConfig } from '#imports'
import fetch from 'node-fetch'
import { scheduleAuctionClose } from '@/server/utils/queues'
import { resolveUserCtoonId } from '@/server/utils/userCtoonId'
import { rarityFloor } from '@/server/utils/auctionPriceSuggestion'

// Longest listing the UI offers: 5 days, or 12 hours for the sub-day presets.
const MAX_DURATION_DAYS = 5
const MAX_DURATION_MINUTES = 12 * 60

function formatDuration(days, minutes) {
  if (minutes > 0) {
    if (minutes % 60 === 0) {
      const hours = minutes / 60
      return `${hours} hour${hours === 1 ? '' : 's'}`
    }
    return `${minutes} minute(s)`
  }
  return `${days} day(s)`
}

export default defineEventHandler(async (event) => {
  // 1. Authenticate
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse & validate
  const {
    userCtoonId,
    initialBet,
    durationDays = 0,
    durationMinutes = 0,
    createInitialBid = false
  } = await readBody(event)

  if (!userCtoonId || initialBet == null ||
      durationDays === undefined || durationMinutes === undefined) {
    throw createError({ statusCode: 422, statusMessage: 'Missing required fields' })
  }

  // Bound the duration. Without this a negative value puts endAt in the past and
  // a huge one locks the cToon out of trading for years while overflowing the
  // BullMQ delay. Re-listing sends a duration the client reconstructed from the
  // previous auction, so this can't be left to the UI.
  const days = Number(durationDays)
  const minutes = Number(durationMinutes)
  if (!Number.isInteger(days) || !Number.isInteger(minutes) ||
      days < 0 || days > MAX_DURATION_DAYS ||
      minutes < 0 || minutes > MAX_DURATION_MINUTES ||
      (days === 0 && minutes === 0)) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid auction duration' })
  }

  if (!Number.isInteger(Number(initialBet)) || Number(initialBet) <= 0) {
    throw createError({ statusCode: 422, statusMessage: 'Initial bet must be a positive whole number' })
  }

  const resolvedUserCtoonId = await resolveUserCtoonId(userCtoonId)
  if (!resolvedUserCtoonId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cToon reference' })
  }

  // 3. Ownership check + fetch rarity
  const userCtoonRec = await prisma.userCtoon.findUnique({
    where: { id: resolvedUserCtoonId },
    select: {
      userId: true,
      ctoonId: true, // needed to check Holiday flag
      burnedAt: true,
      mintNumber: true,
      ctoon: { select: { rarity: true, name: true, assetPath: true, isSecondEdition: true } }
    }
  })
  if (!userCtoonRec || userCtoonRec.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'You do not own this cToon' })
  }
  if (userCtoonRec.burnedAt) {
    throw createError({ statusCode: 400, statusMessage: 'This cToon has been burned and cannot be auctioned' })
  }

  // Rarity -> insta-bid floor. Shared with the pricing hint so the two can't drift.
  const expectedInitialBet = rarityFloor(userCtoonRec.ctoon?.rarity)

  // Enforce minimum initial bet
  if (Number(initialBet) < expectedInitialBet) {
    throw createError({
      statusCode: 422,
      statusMessage: `Initial bet must be at least ${expectedInitialBet} pts for rarity "${userCtoonRec.ctoon?.rarity ?? 'N/A'}"`
    })
  }

  // 4. Active auction check
  const existing = await prisma.auction.findFirst({
    where: { userCtoonId: resolvedUserCtoonId, status: 'ACTIVE' }
  })
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: "There's already an active auction for this cToon" })
  }

  // 4.5 Active pending trade check — block auctions if this UserCtoon is in any pending trade
  const inPendingTrade = await prisma.tradeOfferCtoon.findFirst({
    where: {
      userCtoonId: resolvedUserCtoonId,
      tradeOffer: { status: 'PENDING' }
    },
    select: { id: true }
  })
  if (inPendingTrade) {
    throw createError({ statusCode: 400, statusMessage: 'This cToon is already in a pending trade. Please resolve the trade before auctioning it.' })
  }

  // 5. Compute endAt
  const nowMs    = Date.now()
  const daysMs   = days * 24 * 60 * 60 * 1000
  const minsMs   = minutes * 60 * 1000
  const endAtUtc = new Date(nowMs + daysMs + minsMs).toISOString()

  // 6. Create auction
  //
  // The check in step 4 is a courtesy: it gives the common case a clear error
  // without touching the write path. It is not what makes this safe. Two
  // requests for the same cToon can both pass it, and until both auctions
  // closed — crediting the seller twice and handing the cToon to whichever
  // winner closed last — nothing stopped them. The partial unique index
  // "Auction_active_userCtoonId_key" (WHERE status = 'ACTIVE') is the real
  // guard; P2002 here is the loser of that race.
  let auction
  try {
    auction = await prisma.auction.create({
      data: {
        userCtoonId: resolvedUserCtoonId,
        initialBet: Number(initialBet),
        duration: days,
        endAt: endAtUtc,
        ...(userId ? { creatorId: userId } : {})
      }
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 400, statusMessage: "There's already an active auction for this cToon" })
    }
    throw err
  }

  // 7. Optionally create initial bid — only if amount matches rarity mapping
  if (createInitialBid) {
    if (Number(initialBet) === expectedInitialBet) {
      const initialBidder = await prisma.user.findUnique({
        where: { username: 'CartoonReOrbitOfficial' }
      })
      if (initialBidder) {
        await prisma.bid.create({
          data: {
            auctionId: auction.id,
            userId: initialBidder.id,
            amount: expectedInitialBet
          }
        })
        await prisma.auction.update({
          where: { id: auction.id },
          data: {
            highestBid: expectedInitialBet,
            highestBidderId: initialBidder.id
          }
        })
      }
    }
  }

  // 7.5 Schedule the BullMQ job that will close this auction at endAt
  await scheduleAuctionClose(auction.id, auction.endAt)

  // 8. Disable tradeability
  await prisma.userCtoon.update({
    where: { id: resolvedUserCtoonId },
    data: { isTradeable: false }
  })

  // 8.5 Holiday flag for Discord message
  const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
    where: { ctoonId: userCtoonRec.ctoonId },
    select: { id: true }
  }))

  // 9. Send Discord notification (best effort)
  ;(async () => {
    try {
      const config     = useRuntimeConfig()
      const botToken   = process.env.BOT_TOKEN
      const guildId  = process.env.DISCORD_GUILD_ID

      if (!botToken || !guildId) {
        console.error('Missing BOT_TOKEN or DISCORD_GUILD_ID env vars.')
        return
      }

      // Ensure proper Discord auth header
      const authHeader =
        botToken.startsWith('Bot ') ? botToken : `${botToken}`

      // 1) Look up the "cmart-alerts" channel by name
      const channelsRes = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/channels`,
        {
          method: 'GET',
          headers: {
            Authorization: authHeader,
          },
        }
      )

      if (!channelsRes.ok) {
        console.error(
          'Failed to fetch guild channels:',
          channelsRes.status,
          channelsRes.statusText
        )
        return
      }

      const channels = await channelsRes.json()
      const targetChannel = channels.find(
        (ch) => ch.type === 0 && ch.name === 'cmart-alerts' // type 0 = text channel
      )

      if (!targetChannel) {
        console.error('No channel named "cmart-alerts" found in the guild.')
        return
      }

      const channelId = targetChannel.id

      const baseUrl = config.public.baseUrl ||
        (process.env.NODE_ENV === 'production'
          ? 'https://www.cartoonreorbit.com'
          : `http://localhost:${config.public.socketPort || 3000}`)

      const { name, rarity, assetPath, isSecondEdition } = userCtoonRec.ctoon || {}
      const mintNumber   = userCtoonRec.mintNumber
      const durationText = formatDuration(days, minutes)

      const auctionLink = `${baseUrl}/auction/${auction.id}`
      const rawImageUrl = assetPath
        ? (assetPath.startsWith('http') ? assetPath : `${baseUrl}${assetPath}`)
        : null
      const imageUrl = rawImageUrl ? encodeURI(rawImageUrl) : null

      const lines = [
        `**Rarity:** ${rarity ?? 'N/A'}`,
        ...(!isHolidayItem ? [`**Mint #:** ${mintNumber ?? 'N/A'}`] : []),
        ...(isSecondEdition ? [`**Second Edition**`] : []),
        `**Starting Bid:** ${initialBet} pts`,
        `**Duration:** ${durationText}`
      ]

      const payload = {
        content: `<@${me.discordId}> has created a new auction!`,
        embeds: [{
          title: `${name ?? 'cToon'}${isSecondEdition ? ' (Second Edition)' : ''}`,
          url: auctionLink,
          description: lines.join('\n'),
          ...(imageUrl ? { image: { url: imageUrl } } : {})
        }]
      }

      await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `${botToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )
    } catch (discordErr) {
      console.error('Failed to send Discord notification:', discordErr)
    }
  })()

  // 10. Return to client
  return { success: true, auction }
})
