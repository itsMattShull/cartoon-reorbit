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
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse & validate
  //
  // `|| {}` because h3 returns undefined for an empty body, and a bare
  // destructure of that throws a TypeError — a 500 where the caller deserves a
  // 422. A non-JSON content-type can also make readBody return a raw string,
  // which the object check below catches.
  const body = (await readBody(event)) || {}
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 422, statusMessage: 'Malformed request body' })
  }

  const {
    userCtoonId,
    initialBet,
    durationDays = 0,
    durationMinutes = 0,
    createInitialBid = false
  } = body

  if (!userCtoonId || initialBet == null) {
    throw createError({ statusCode: 422, statusMessage: 'Missing required fields' })
  }

  // Bound the duration. Without this a negative value puts endAt in the past and
  // a huge one locks the cToon out of trading for years while overflowing the
  // BullMQ delay. Re-listing sends a duration the client reconstructed from the
  // previous auction, so this can't be left to the UI.
  //
  // resolveAuctionDuration reduces the pair to a single `totalMinutes`, and
  // that number is the only thing used below — endAt, both stored columns and
  // the Discord label all derive from it. Keeping days and minutes alive past
  // this point would mean two arithmetic paths that have to agree forever.
  const durationResult = resolveAuctionDuration({ durationDays, durationMinutes })
  if (!durationResult.ok) {
    throw createError({ statusCode: 422, statusMessage: durationResult.reason })
  }
  const totalMinutes = durationResult.totalMinutes

  // Coerce the bet exactly once, here. Every later use — the floor check, the
  // DB write, the Discord embed — reads `bet`, never the raw body value. The
  // embed used to interpolate the raw value, so an initialBet of ["500\n\n\n"]
  // passed validation as 500, stored as 500, and injected blank lines into the
  // announcement around the Duration line.
  const bet = typeof initialBet === 'number'
    ? initialBet
    : (typeof initialBet === 'string' && /^\d{1,10}$/.test(initialBet) ? Number(initialBet) : NaN)
  if (!Number.isSafeInteger(bet) || bet <= 0) {
    throw createError({ statusCode: 422, statusMessage: 'Initial bet must be a positive whole number' })
  }
  // Auction.initialBet is an int4; without a ceiling this fails at the DB as a 500.
  if (bet > MAX_INITIAL_BET) {
    throw createError({ statusCode: 422, statusMessage: 'Initial bet is too large' })
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
  if (bet < expectedInitialBet) {
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
  // One arithmetic path, derived solely from the validated totalMinutes.
  const closeDelayMs = totalMinutes * 60000
  if (closeDelayMs > MAX_CLOSE_DELAY_MS) {
    // Unreachable while MAX_AUCTION_MINUTES is 7 days; here so that raising it
    // past BullMQ's ~24.8-day setTimeout ceiling fails loudly instead of
    // producing auctions that close the instant they are created.
    throw createError({ statusCode: 422, statusMessage: 'Invalid auction duration' })
  }
  const endAtUtc = new Date(Date.now() + closeDelayMs).toISOString()

  // 6. Create auction
  //
  // The check in step 4 is a courtesy: it gives the common case a clear error
  // without touching the write path. It is not what makes this safe. Two
  // requests for the same cToon can both pass it, and until both auctions
  // closed — crediting the seller twice and handing the cToon to whichever
  // winner closed last — nothing stopped them. The partial unique index
  // "Auction_active_userCtoonId_key" (WHERE status = 'ACTIVE') is the real
  // guard; P2002 here is the loser of that race.
  //
  // Creating the auction and clearing isTradeable are one transaction: a crash
  // between them used to leave an ACTIVE auction on a cToon the collection UI
  // still offered as tradeable, for the whole life of the listing. Trades never
  // actually double-spent it — server/utils/tradeOffer.js queries the Auction
  // table directly rather than trusting the flag — but the UI lied, and a
  // 7-day listing lies for a week.
  let auction
  try {
    auction = await prisma.$transaction(async (tx) => {
      // Claim the cToon BEFORE creating the auction, in the same transaction.
      //
      // This is both the lock guard and a fix for the write that used to sit
      // after the create: an auction could exist on a still-tradeable copy if the
      // process died in between. Doing it as a conditional updateMany here means
      // the row lock is taken before anything else, so a concurrent
      // POST /api/locks — whose own conditional updateMany contends on this
      // same row — serializes against it. Check-then-write on either side would
      // let a lock and an auction for one copy both commit, which is the
      // exact state both guards exist to prevent.
      //
      // "Not locked by me" is spelled out rather than written as `not: userId`:
      // in SQL a NULL column is neither equal nor unequal to a value, so the
      // terser form would silently exclude every un-locked copy.
      const claimed = await tx.userCtoon.updateMany({
        where: {
          id: resolvedUserCtoonId,
          userId,
          burnedAt: null,
          OR: [{ lockedByUserId: null }, { lockedByUserId: { not: userId } }]
        },
        data: { isTradeable: false }
      })
      if (claimed.count !== 1) {
        throw createError({
          statusCode: 400,
          statusMessage: 'This cToon is locked. Unlock it before putting it up for auction.'
        })
      }

      // Note: the owner's trade-list entry is deliberately left alone.
      //
      // The listing stays visible (trade-list/users/[username].get.js does not
      // filter isTradeable), but it is cosmetic: an offer naming a cToon in an
      // active auction is refused by validateTradeOfferInputs, both by the
      // ACTIVE-auction guard and by the isTradeable filter on its ownership
      // query. So clearing it would buy no protection, and would silently drop
      // something off the owner's Trade List that they would then have to
      // re-add — never having been told it went.

      return tx.auction.create({
        data: {
          userCtoonId: resolvedUserCtoonId,
          initialBet: Number(initialBet),
          duration: days,
          endAt: endAtUtc,
          ...(userId ? { creatorId: userId } : {})
        }
      })
      await tx.userCtoon.update({
        where: { id: resolvedUserCtoonId },
        data: { isTradeable: false }
      })
      return created
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 400, statusMessage: "There's already an active auction for this cToon" })
    }
    throw err
  }

  // 7. Optionally create initial bid — only if amount matches rarity mapping
  if (createInitialBid) {
    if (bet === expectedInitialBet) {
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

  // 8. Tradeability was already disabled by the claim in step 6, which is what
  // makes it atomic with the auction row.

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
      const durationText = formatAuctionDuration(totalMinutes)

      const auctionLink = `${baseUrl}/auction/${auction.id}`
      const rawImageUrl = assetPath
        ? (assetPath.startsWith('http') ? assetPath : `${baseUrl}${assetPath}`)
        : null
      const imageUrl = rawImageUrl ? encodeURI(rawImageUrl) : null

      const lines = [
        `**Rarity:** ${rarity ?? 'N/A'}`,
        ...(!isHolidayItem ? [`**Mint #:** ${mintNumber ?? 'N/A'}`] : []),
        ...(isSecondEdition ? [`**Second Edition**`] : []),
        `**Starting Bid:** ${bet} pts`,
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
