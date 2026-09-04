// server/utils/auctionOnlyActivate.js
//
// Shared "activate an AuctionOnly listing into a live Auction" logic, used by
// both the hourly cron job (server/cron/sync-guild-members.js) and the manual
// admin "Start Now" endpoint (server/api/admin/auction-only/[id]/start.post.js)
// so the two paths can never drift apart.
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'
import { scheduleAuctionClose } from './queues.js'
import { rarityFloor } from './auctionPriceSuggestion.js'
import { logAuctionOnlyError } from './auctionOnlyErrorLog.js'
import {
  MIN_AUCTION_MINUTES,
  MAX_AUCTION_MINUTES,
  formatAuctionDuration
} from './auctionDuration.js'

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
      `**Duration:** ${formatAuctionDuration(result.totalMinutes ?? result.durationDays * 1440)}`
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

// A refused listing stays pending, so startDueAuctions retries it every hour
// until the blockage clears. Logging every attempt would bury the admin's Error
// Log under repeats of a single problem, so a given listing is only recorded
// once per window. The window is deliberately shorter than a typical auction, so
// a long-running blockage still re-surfaces occasionally rather than going quiet.
const REFUSAL_LOG_WINDOW_MS = 6 * 60 * 60 * 1000

async function logActivationRefusalOnce(auctionOnlyId, reason) {
  try {
    const recent = await prisma.auctionOnlyErrorLog.findFirst({
      where: {
        auctionOnlyId,
        context: 'activation',
        createdAt: { gte: new Date(Date.now() - REFUSAL_LOG_WINDOW_MS) }
      },
      select: { id: true }
    })
    if (recent) return
  } catch {
    // If the dedupe lookup fails, fall through and log anyway — a duplicate row
    // is far cheaper than losing the only record that something was refused.
  }
  await logAuctionOnlyError('activation', new Error(reason), auctionOnlyId)
}

// Activates a single AuctionOnly row (id + userCtoon include as above) into a
// live Auction. Returns:
//   - the created-auction summary on success
//   - null if the row was already started by the time the transaction runs
//     (not an error — just lost a race)
//   - { refused: true, reason } if it cannot be activated right now: the
//     official account no longer holds the copy, or another auction is already
//     live for it. The listing is left pending (not marked isStarted) rather
//     than activated against whoever holds the copy now or silently consumed,
//     and the refusal is logged to AuctionOnlyErrorLog for the Manage Auction
//     Only page.
export async function activateAuctionOnlyRow(row) {
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
        isFeatured: true,
        featuredOwnLimit: true
      }
    })
    if (!fresh || fresh.isStarted) return null

    const official = await tx.user.findUnique({
      where: { username: OFFICIAL_USERNAME },
      select: { id: true }
    })
    if (!official) return { refused: true, reason: 'Official account not found' }

    const userCtoon = await tx.userCtoon.findUnique({
      where: { id: fresh.userCtoonId },
      select: { userId: true, mintNumber: true, burnedAt: true }
    })
    if (!userCtoon || userCtoon.userId !== official.id) {
      return { refused: true, reason: 'The official account no longer holds this copy — listing left pending.' }
    }
    // A burned copy stays attached to its owner, so the ownership check above
    // passes for one. There is nothing left to sell either way.
    if (userCtoon.burnedAt) {
      return { refused: true, reason: 'This copy has been burned — listing left pending.' }
    }

    // Something else already has this copy up for auction. This used to mark the
    // listing isStarted and return, which spent a scheduled release without ever
    // creating an auction for it — silently, with nothing logged. A mint
    // scheduled at 1500 could simply never go up, and no record said why.
    //
    // Leave it pending instead, so the listing survives and still fires once the
    // blocking auction clears:
    //   * that auction is still running -> retried on the next pass
    //   * it closed unsold, copy back with the official account -> activates as
    //     scheduled, at the intended price
    //   * it closed sold -> the ownership check above refuses, since there is no
    //     longer anything here to sell
    const active = await tx.auction.findFirst({
      where: { userCtoonId: fresh.userCtoonId, status: 'ACTIVE' },
      select: { id: true, initialBet: true, endAt: true, auctionOnlyId: true }
    })
    if (active) {
      return {
        refused: true,
        reason:
          `Another auction (id ${active.id}, start ${active.initialBet} pts, ends ` +
          `${new Date(active.endAt).toISOString()}) is already live for this copy` +
          (active.auctionOnlyId ? '' : ' and did not come from a scheduled listing') +
          ' — listing left pending and will be retried once that auction clears.'
      }
    }

    const floor = rarityFloor(row.userCtoon?.ctoon?.rarity)
    const initialBet = Math.max(Number(fresh.pricePoints || 0), floor)

    // Derive the length from the scheduled window. The cap must track the admin
    // bound in server/api/admin/auction-only/index.post.js — when it said 5 and
    // the admin bound said 7, a 7-day listing ran for the full 7 days but
    // recorded duration: 5 and announced "Duration: 5 day(s)" on Discord.
    const ms = new Date(fresh.endsAt).getTime() - new Date(fresh.startsAt).getTime()
    const totalMinutes = Math.max(
      MIN_AUCTION_MINUTES,
      Math.min(MAX_AUCTION_MINUTES, Math.round(ms / 60000) || MIN_AUCTION_MINUTES)
    )
    const durationDays = Math.floor(totalMinutes / 1440)

    const created = await tx.auction.create({
      data: {
        userCtoonId: fresh.userCtoonId,
        initialBet,
        duration: durationDays,
        durationMinutes: totalMinutes,
        endAt: new Date(fresh.endsAt),
        creatorId: userCtoon.userId,
        isFeatured: fresh.isFeatured,
        featuredOwnLimit: fresh.featuredOwnLimit,
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
      totalMinutes,
      ctoon: row.userCtoon.ctoon,
      mintNumber: userCtoon.mintNumber,
      ctoonId: row.userCtoon.ctoon.id,
      isFeatured: fresh.isFeatured
    }
  })

  if (!result) return null

  if (result.refused) {
    await logActivationRefusalOnce(row.id, result.reason)
    return result
  }

  await scheduleAuctionClose(result.auctionId, result.endAt)

  const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
    where: { ctoonId: result.ctoonId },
    select: { id: true }
  }))

  await sendAuctionOnlyDiscordAnnouncement(result, isHolidayItem)

  return result
}
