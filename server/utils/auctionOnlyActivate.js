// server/utils/auctionOnlyActivate.js
//
// Shared "activate an AuctionOnly listing into a live Auction" logic, used by
// both the hourly cron job (server/cron/sync-guild-members.js) and the manual
// admin "Start Now" endpoint (server/api/admin/auction-only/[id]/start.post.js)
// so the two paths can never drift apart.
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'
import { scheduleAuctionClose } from './queues.js'
import { logAuctionOnlyError } from './auctionOnlyErrorLog.js'
import { rarityFloor } from './auctionPriceSuggestion.js'

const DISCORD_API = 'https://discord.com/api/v10'
const OFFICIAL_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

export async function sendAuctionOnlyDiscordAnnouncement(result, isHolidayItem = false) {
  try {
    const botToken = process.env.DISCORD_ANNOUNCEMENTS_BOT_TOKEN || process.env.BOT_TOKEN
    const guildId = process.env.DISCORD_GUILD_ID

    if (!botToken || !guildId) {
      console.error('Missing DISCORD_ANNOUNCEMENTS_BOT_TOKEN/BOT_TOKEN or DISCORD_GUILD_ID env vars.')
      return
    }

    const authHeader = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`

    const channelsRes = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
      method: 'GET',
      headers: { Authorization: authHeader }
    })
    if (!channelsRes.ok) {
      console.error('Failed to fetch guild channels:', channelsRes.status, channelsRes.statusText)
      return
    }

    const channels = await channelsRes.json()
    const targetChannel = channels.find((ch) => ch.type === 0 && ch.name === 'cmart-alerts')
    if (!targetChannel) {
      console.error('No channel named "cmart-alerts" found in the guild.')
      return
    }

    const channelId = targetChannel.id
    const baseUrl =
      process.env.PUBLIC_BASE_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://www.cartoonreorbit.com'
        : `http://localhost:${process.env.SOCKET_PORT || 3000}`)

    const { name, rarity, assetPath } = result.ctoon || {}
    const auctionLink = `${baseUrl}/auction/${result.auctionId}`
    const rawImageUrl = assetPath ? (assetPath.startsWith('http') ? assetPath : `${baseUrl}${assetPath}`) : null
    const imageUrl = rawImageUrl ? encodeURI(rawImageUrl) : null

    const lines = [
      `**Rarity:** ${rarity ?? 'N/A'}`,
      ...(!isHolidayItem ? [`**Mint #:** ${result.mintNumber ?? 'N/A'}`] : []),
      `**Starting Bid:** ${result.initialBet} pts`,
      `**Duration:** ${result.durationDays} day(s)`
    ]

    const payload = {
      content: `A scheduled auction is now live.`,
      embeds: [{
        title: name ?? 'cToon',
        url: auctionLink,
        description: lines.join('\n'),
        ...(imageUrl ? { image: { url: imageUrl } } : {})
      }]
    }

    await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch (e1) {
    // best-effort only
  }
}

export const AUCTION_ONLY_ROW_INCLUDE = {
  userCtoon: {
    select: {
      id: true,
      mintNumber: true,
      userId: true,
      ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
    }
  }
}

// Activates a single AuctionOnly row (id + userCtoon include as above) into a
// live Auction. Returns the created-auction summary, or null if the row was
// already started / already has a live Auction by the time the transaction runs.
export async function activateAuctionOnlyRow(row) {
  // Resolved once per activation, outside the transaction, so the ownership
  // check below costs nothing extra inside it.
  const officialUser = await prisma.user.findUnique({
    where: { username: OFFICIAL_USERNAME },
    select: { id: true }
  })
  const officialUserId = officialUser?.id || null

  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.auctionOnly.findUnique({
      where: { id: row.id },
      select: {
        id: true,
        isStarted: true,
        userCtoonId: true,
        pricePoints: true,
        startsAt: true,
        endsAt: true,
        isFeatured: true
      }
    })
    if (!fresh || fresh.isStarted) return null

    const active = await tx.auction.findFirst({
      where: { userCtoonId: fresh.userCtoonId, status: 'ACTIVE' },
      select: { id: true }
    })
    if (active) {
      await tx.auctionOnly.update({ where: { id: fresh.id }, data: { isStarted: true } })
      return null
    }

    // The copy must still be held by the official account. Every AuctionOnly
    // listing is created against official-account inventory — index.post.js
    // rejects anything else with "UserCtoon not owned by official account" — so
    // if the copy has moved on, this listing no longer has anything to sell.
    //
    // This is not a theoretical guard. If something auctions the copy early (a
    // random featured-auction draw used to be able to) and that auction sells
    // before the scheduled start time, then by the time startDueAuctions loads
    // this listing the cToon already belongs to the buyer. Taking creatorId from
    // the loaded row would then list a player's private property, flip it to
    // isTradeable: false without their consent, and pay them the proceeds of a
    // sale they never agreed to.
    //
    // Note it is deliberately checked against the official account rather than
    // against row.userCtoon.userId: the row is re-read on every cron pass, so a
    // sale that completed between passes would make the stale snapshot and the
    // current owner agree with each other and slip through.
    //
    // Deliberately does NOT set isStarted — the listing stays pending so an
    // admin can see it unresolved on the Manage Auction Only page and decide.
    const owner = await tx.userCtoon.findUnique({
      where: { id: fresh.userCtoonId },
      select: { userId: true, burnedAt: true }
    })
    if (!owner || !officialUserId || owner.userId !== officialUserId || owner.burnedAt) {
      return {
        ownershipChanged: true,
        auctionOnlyId: fresh.id,
        reason: !owner
          ? 'the copy no longer exists'
          : owner.burnedAt
            ? 'the copy has been burned'
            : !officialUserId
              ? `the official account (${OFFICIAL_USERNAME}) could not be resolved`
              : 'the copy is no longer held by the official account (sold, traded or granted away)'
      }
    }

    const floor = rarityFloor(row.userCtoon?.ctoon?.rarity)
    const initialBet = Math.max(Number(fresh.pricePoints || 0), floor)

    const ms = new Date(fresh.endsAt).getTime() - new Date(fresh.startsAt).getTime()
    const durationDays = Math.max(1, Math.min(5, Math.round(ms / 86400000) || 1))

    const created = await tx.auction.create({
      data: {
        userCtoonId: fresh.userCtoonId,
        initialBet,
        duration: durationDays,
        endAt: new Date(fresh.endsAt),
        // From the owner re-read above, never the loaded snapshot — that is the
        // stale value that could name a buyer instead of the seller.
        creatorId: owner.userId,
        isFeatured: fresh.isFeatured,
        auctionOnlyId: fresh.id
      },
      select: { id: true }
    })

    await tx.userCtoon.update({
      where: { id: fresh.userCtoonId },
      data: { isTradeable: false }
    })

    await tx.auctionOnly.update({
      where: { id: fresh.id },
      data: { isStarted: true }
    })

    return {
      auctionId: created.id,
      endAt: new Date(fresh.endsAt),
      initialBet,
      durationDays,
      ctoon: row.userCtoon.ctoon,
      mintNumber: row.userCtoon.mintNumber,
      ctoonId: row.userCtoon.ctoon.id,
      isFeatured: fresh.isFeatured
    }
  })

  if (!result) return null

  // Refused above because the copy changed hands. Surface it on the admin
  // "Manage Auction Only" page instead of failing silently, then stop — there is
  // no auction to close and nothing to announce.
  if (result.ownershipChanged) {
    await logAuctionOnlyError(
      'activation',
      new Error(
        `Refused to activate AuctionOnly ${result.auctionOnlyId}: ${result.reason}. ` +
        `Activating would have auctioned a cToon the official account no longer holds. ` +
        `Listing left pending for an admin to resolve.`
      ),
      result.auctionOnlyId
    )
    // Distinguishable from the plain `null` returns above so the manual
    // "Start Now" endpoint can tell an admin why, rather than reporting the
    // generic "changed concurrently". Callers must not read auctionId off this.
    return { refused: true, reason: result.reason }
  }

  await scheduleAuctionClose(result.auctionId, result.endAt)

  const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
    where: { ctoonId: result.ctoonId },
    select: { id: true }
  }))

  await sendAuctionOnlyDiscordAnnouncement(result, isHolidayItem)

  return result
}
