// server/api/auctions.post.js

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
  const { userCtoonId, initialBet, durationDays = 0, durationMinutes = 0 } = await readBody(event)
  if (!userCtoonId || !initialBet || (durationDays === undefined || durationMinutes === undefined)) {
    throw createError({ statusCode: 422, statusMessage: 'Missing required fields' })
  }

  // 3. Ownership check
  const ownerCheck = await prisma.userCtoon.findUnique({
    where: { id: userCtoonId },
    select: { userId: true }
  })
  if (!ownerCheck || ownerCheck.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'You do not own this cToon' })
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
      initialBet,
      duration: durationDays,
      endAt: endAtUtc,
      ...(userId ? { creatorId: userId } : {})
    }
  })

  // 7. Disable tradeability
  await prisma.userCtoon.update({
    where: { id: userCtoonId },
    data: { isTradeable: false }
  })

  // 8. Send Discord notification (best effort)
  ;(async () => {
    try {
      const config     = useRuntimeConfig()
      const botToken   = process.env.BOT_TOKEN
      const channelId  = '1370959477968339004'

      // get base URL (production vs. dev)
      const baseUrl = config.public.baseUrl ||
        (process.env.NODE_ENV === 'production'
          ? 'https://www.cartoonreorbit.com'
          : `http://localhost:${config.public.socketPort || 3000}`)

      // fetch ctoon details
      const userCtoon = await prisma.userCtoon.findUnique({
        where: { id: userCtoonId },
        include: { ctoon: true }
      })
      if (!userCtoon) throw new Error('Failed to load cToon for Discord message')

      const { name, rarity, assetPath } = userCtoon.ctoon
      const mintNumber = userCtoon.mintNumber
      const durationText = durationMinutes > 0
        ? `${durationMinutes} minute(s)`
        : `${durationDays} day(s)`

      const auctionLink = `${baseUrl}/auction/${auction.id}`

      // build full image URL
      const imageUrl = assetPath
        ? assetPath.startsWith('http')
          ? assetPath
          : `${baseUrl}/images${assetPath}`
        : null

        console.log(imageUrl)

      // construct payload with embed including image
      const payload = {
        content: `<@${me.discordId}> has created a new auction!`,
        embeds: [
          {
            title: name,
            url: auctionLink,
            description: `**Rarity:** ${rarity}\n**Mint #:** ${mintNumber ?? 'N/A'}\n**Starting Bid:** ${initialBet} pts\n**Duration:** ${durationText}`,
            ...(imageUrl ? { image: { url: imageUrl } } : {})
          }
        ]
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

  // 9. Return to client
  return { success: true, auction }
})
