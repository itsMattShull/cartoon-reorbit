import {
  defineEventHandler,
  getRequestHeader,
  readBody,
  createError
} from 'h3'
import { prisma } from '@/server/prisma'
import { useRuntimeConfig } from '#imports'
import fetch from 'node-fetch'

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

  if (!userCtoonId || !initialBet ||
      durationDays === undefined || durationMinutes === undefined) {
    throw createError({ statusCode: 422, statusMessage: 'Missing required fields' })
  }

  // 3. Ownership check + fetch rarity (and details we’ll reuse later)
  const userCtoonRec = await prisma.userCtoon.findUnique({
    where: { id: userCtoonId },
    select: {
      userId: true,
      mintNumber: true,
      ctoon: { select: { rarity: true, name: true, assetPath: true } }
    }
  })
  if (!userCtoonRec || userCtoonRec.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'You do not own this cToon' })
  }

  // Helper: map rarity -> expected insta bid
  const rarityToExpectedBid = (rarityRaw) => {
    const r = (rarityRaw || '').trim().toLowerCase()
    switch (r) {
      case 'common': return 25
      case 'uncommon': return 50
      case 'rare': return 100
      case 'very rare': return 187
      default: return 312
    }
  }

  const expectedInitialBet = rarityToExpectedBid(userCtoonRec.ctoon?.rarity)

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
      initialBet,
      duration: durationDays,
      endAt: endAtUtc,
      ...(userId ? { creatorId: userId } : {})
    }
  })

  // 7. Optionally create initial bid — but only if the amount matches rarity mapping
  if (createInitialBid) {
    if (initialBet !== expectedInitialBet) {
      // console.log(
      //   `Skipping initial bid: expected ${expectedInitialBet} for rarity "${userCtoonRec.ctoon?.rarity}", got ${initialBet}`
      // )
    } else {
      // find the special user to place the initial bid
      const initialBidder = await prisma.user.findUnique({
        where: { username: 'CartoonReOrbitOfficial' }
      })
      if (initialBidder) {
        await prisma.bid.create({
          data: {
            auctionId: auction.id,
            userId: initialBidder.id,
            amount: initialBet
          }
        })
        await prisma.auction.update({
          where: { id: auction.id },
          data: {
            highestBid: initialBet,
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

  // 9. Send Discord notification (best effort)
  ;(async () => {
    try {
      const config     = useRuntimeConfig()
      const botToken   = process.env.BOT_TOKEN
      const channelId  = '1401244687163068528'

      // get base URL
      const baseUrl = config.public.baseUrl ||
        (process.env.NODE_ENV === 'production'
          ? 'https://www.cartoonreorbit.com'
          : `http://localhost:${config.public.socketPort || 3000}`)

      // reuse details we already fetched
      const { name, rarity, assetPath } = userCtoonRec.ctoon || {}
      const mintNumber = userCtoonRec.mintNumber
      const durationText = durationMinutes > 0
        ? `${durationMinutes} minute(s)`
        : `${durationDays} day(s)`

      const auctionLink = `${baseUrl}/auction/${auction.id}`
      const rawImageUrl = assetPath
        ? (assetPath.startsWith('http') ? assetPath : `${baseUrl}${assetPath}`)
        : null
      const imageUrl = rawImageUrl ? encodeURI(rawImageUrl) : null

      const payload = {
        content: `<@${me.discordId}> has created a new auction!`,
        embeds: [{
          title: name ?? 'cToon',
          url: auctionLink,
          description: `**Rarity:** ${rarity ?? 'N/A'}\n**Mint #:** ${mintNumber ?? 'N/A'}\n**Starting Bid:** ${initialBet} pts\n**Duration:** ${durationText}`,
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
