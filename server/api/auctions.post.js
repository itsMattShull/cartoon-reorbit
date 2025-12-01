import {
  defineEventHandler,
  getRequestHeader,
  readBody,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'
import { useRuntimeConfig } from '#imports'
import fetch from 'node-fetch'

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

  // 3. Ownership check + fetch rarity
  const userCtoonRec = await prisma.userCtoon.findUnique({
    where: { id: userCtoonId },
    select: {
      userId: true,
      ctoonId: true, // needed to check Holiday flag
      mintNumber: true,
      ctoon: { select: { rarity: true, name: true, assetPath: true } }
    }
  })
  if (!userCtoonRec || userCtoonRec.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'You do not own this cToon' })
  }

  // Helper: map rarity -> insta-bid floor (must match client)
  const rarityToExpectedBid = (rarityRaw) => {
    const r = (rarityRaw || '').trim().toLowerCase()
    switch (r) {
      case 'common': return 25
      case 'uncommon': return 50
      case 'rare': return 100
      case 'very rare': return 187
      case 'crazy rare': return 312
      case 'code only': return 50
      case 'prize only': return 50
      case 'auction only': return 50
      default: return 50
    }
  }

  const expectedInitialBet = rarityToExpectedBid(userCtoonRec.ctoon?.rarity)

  // Enforce minimum initial bet
  if (Number(initialBet) < expectedInitialBet) {
    throw createError({
      statusCode: 422,
      statusMessage: `Initial bet must be at least ${expectedInitialBet} pts for rarity "${userCtoonRec.ctoon?.rarity ?? 'N/A'}"`
    })
  }

  // 4. Active auction check
  const existing = await prisma.auction.findFirst({
    where: { userCtoonId, status: 'ACTIVE' }
  })
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: 'There’s already an active auction for this cToon' })
  }

  // 5. Compute endAt
  const nowMs    = Date.now()
  const daysMs   = durationDays * 24 * 60 * 60 * 1000
  const minsMs   = durationMinutes * 60 * 1000
  const endAtUtc = new Date(nowMs + daysMs + minsMs).toISOString()

  // 6. Create auction
  const auction = await prisma.auction.create({
    data: {
      userCtoonId,
      initialBet: Number(initialBet),
      duration: durationDays,
      endAt: endAtUtc,
      ...(userId ? { creatorId: userId } : {})
    }
  })

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

  // 8. Disable tradeability
  await prisma.userCtoon.update({
    where: { id: userCtoonId },
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

      const { name, rarity, assetPath } = userCtoonRec.ctoon || {}
      const mintNumber   = userCtoonRec.mintNumber
      const durationText = formatDuration(durationDays, durationMinutes)

      const auctionLink = `${baseUrl}/auction/${auction.id}`
      const rawImageUrl = assetPath
        ? (assetPath.startsWith('http') ? assetPath : `${baseUrl}${assetPath}`)
        : null
      const imageUrl = rawImageUrl ? encodeURI(rawImageUrl) : null

      const lines = [
        `**Rarity:** ${rarity ?? 'N/A'}`,
        ...(!isHolidayItem ? [`**Mint #:** ${mintNumber ?? 'N/A'}`] : []),
        `**Starting Bid:** ${initialBet} pts`,
        `**Duration:** ${durationText}`
      ]

      const payload = {
        content: `<@${me.discordId}> has created a new auction!`,
        embeds: [{
          title: name ?? 'cToon',
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
