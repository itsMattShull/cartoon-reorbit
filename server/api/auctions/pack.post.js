// POST /api/auctions/pack   { userPackId, initialBet, durationDays?, durationMinutes? }
//
// Puts one of the caller's SEALED packs up for auction. A separate route from POST /api/auctions on purpose: the cToon
// endpoint's rarity floor, insta-bid, isTradeable claim and holiday logic are all about a minted card, and threading a
// second item type through it would put every one of those branches at risk for no benefit. Everything after creation —
// bidding, auto-bids, closing, settlement — is shared (see server/utils/auctionSettle.js).
//
// Rules (product-owner decisions): any positive whole-number starting bid up to the same cap as cToons; no rarity floor
// and no "official" insta-bid; never featured; not while the pack is in a pending trade (and a pack in an active auction
// can't be traded or opened — enforced on those paths by the same lock + lock-state check, server/utils/userPackState.js).
//
// Concurrency: lockAndAssertPacks locks the UserPack row FIRST, then re-checks "sealed, mine, in no auction, in no pending
// trade" under that lock, so a trade being created for the same pack at the same instant either commits first (and this
// is refused) or waits (and the trade is refused). The partial unique index "Auction_active_userPackId_key" is the
// backstop for any writer that forgets.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { scheduleAuctionClose } from '@/server/utils/queues'
import { isUuid } from '@/server/utils/tradeOfferRules'
import { lockAndAssertPacks } from '@/server/utils/userPackState'
import {
  resolveAuctionDuration,
  formatAuctionDuration,
  MAX_INITIAL_BET,
  MAX_CLOSE_DELAY_MS
} from '@/server/utils/auctionDuration'

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
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // 2. Validate
  const body = (await readBody(event)) || {}
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 422, statusMessage: 'Malformed request body' })
  }
  const userPackId = typeof body.userPackId === 'string' ? body.userPackId.toLowerCase() : null
  if (!isUuid(userPackId) || body.initialBet == null) {
    throw createError({ statusCode: 422, statusMessage: 'Missing required fields' })
  }

  const durationResult = resolveAuctionDuration({ durationDays: body.durationDays ?? 0, durationMinutes: body.durationMinutes ?? 0 })
  if (!durationResult.ok) throw createError({ statusCode: 422, statusMessage: durationResult.reason })
  const totalMinutes = durationResult.totalMinutes

  // Coerced exactly once; everything below (floor check, DB write, Discord text) reads `bet`, never the raw body value.
  const raw = body.initialBet
  const bet = typeof raw === 'number'
    ? raw
    : (typeof raw === 'string' && /^\d{1,10}$/.test(raw) ? Number(raw) : NaN)
  if (!Number.isSafeInteger(bet) || bet <= 0) {
    throw createError({ statusCode: 422, statusMessage: 'Initial bet must be a positive whole number' })
  }
  if (bet > MAX_INITIAL_BET) throw createError({ statusCode: 422, statusMessage: 'Initial bet is too large' })

  const closeDelayMs = totalMinutes * 60000
  if (closeDelayMs > MAX_CLOSE_DELAY_MS) throw createError({ statusCode: 422, statusMessage: 'Invalid auction duration' })
  const endAt = new Date(Date.now() + closeDelayMs)

  // 3. Lock the pack, verify, create — one transaction.
  let auction
  let packInfo
  try {
    auction = await prisma.$transaction(async (tx) => {
      await lockAndAssertPacks(tx, [userPackId], { ownerId: userId })
      packInfo = await tx.userPack.findUnique({
        where: { id: userPackId },
        select: { pack: { select: { name: true, imagePath: true } } }
      })
      return tx.auction.create({
        data: {
          kind: 'PACK',
          userPackId,
          initialBet: bet,
          duration: Math.floor(totalMinutes / 1440),
          durationMinutes: totalMinutes,
          endAt,
          creatorId: userId
        }
      })
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 400, statusMessage: "There's already an active auction for this pack" })
    }
    throw err
  }

  // 4. Close the auction at endAt (same scheduler as cToon auctions).
  await scheduleAuctionClose(auction.id, auction.endAt)

  // 5. Announce it (best effort — never fails the request).
  ;(async () => {
    try {
      const botToken = process.env.BOT_TOKEN
      const guildId = process.env.DISCORD_GUILD_ID
      if (!botToken || !guildId) return
      const authHeader = botToken.startsWith('Bot ') ? botToken : `${botToken}`
      const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: authHeader } })
      if (!channelsRes.ok) return
      const channels = await channelsRes.json()
      const channel = channels.find(ch => ch.type === 0 && ch.name === 'cmart-alerts')
      if (!channel) return

      const baseUrl = process.env.NODE_ENV === 'production' ? 'https://www.cartoonreorbit.com' : 'http://localhost:3000'
      const art = packInfo?.pack?.imagePath
      const imageUrl = art ? encodeURI(art.startsWith('http') ? art : `${baseUrl}${art}`) : null
      await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `<@${me.discordId}> has created a new auction!`,
          embeds: [{
            title: `${packInfo?.pack?.name ?? 'Pack'} (sealed pack)`,
            url: `${baseUrl}/newsite/AuctionHouse/${auction.id}`,
            description: [`**Starting Bid:** ${bet} pts`, `**Duration:** ${formatAuctionDuration(totalMinutes)}`].join('\n'),
            ...(imageUrl ? { image: { url: imageUrl } } : {})
          }]
        })
      })
    } catch (err) {
      console.error('Failed to send pack auction Discord notification:', err)
    }
  })()

  return { success: true, auction }
})
