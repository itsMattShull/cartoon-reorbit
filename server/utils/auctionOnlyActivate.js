// server/utils/auctionOnlyActivate.js
//
// Shared "activate an AuctionOnly listing into a live Auction" logic, used by
// both the hourly cron job (server/cron/sync-guild-members.js) and the manual
// admin "Start Now" endpoint (server/api/admin/auction-only/[id]/start.post.js)
// so the two paths can never drift apart.
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'
import { scheduleAuctionClose } from './queues.js'

const DISCORD_API = 'https://discord.com/api/v10'

export function auctionOnlyRarityFloor(r) {
  const s = (r || '').trim().toLowerCase()
  if (s === 'common') return 25
  if (s === 'uncommon') return 50
  if (s === 'rare') return 100
  if (s === 'very rare') return 187
  if (s === 'crazy rare') return 312
  return 50
}

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
      creatorId: true,
      ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
    }
  }
}

// Activates a single AuctionOnly row (id + userCtoon include as above) into a
// live Auction. Returns the created-auction summary, or null if the row was
// already started / already has a live Auction by the time the transaction runs.
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

    const floor = auctionOnlyRarityFloor(row.userCtoon?.ctoon?.rarity)
    const initialBet = Math.max(Number(fresh.pricePoints || 0), floor)

    const ms = new Date(fresh.endsAt).getTime() - new Date(fresh.startsAt).getTime()
    const durationDays = Math.max(1, Math.min(5, Math.round(ms / 86400000) || 1))

    const created = await tx.auction.create({
      data: {
        userCtoonId: fresh.userCtoonId,
        initialBet,
        duration: durationDays,
        endAt: new Date(fresh.endsAt),
        creatorId: row.userCtoon?.creatorId,
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

  await scheduleAuctionClose(result.auctionId, result.endAt)

  const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
    where: { ctoonId: result.ctoonId },
    select: { id: true }
  }))

  await sendAuctionOnlyDiscordAnnouncement(result, isHolidayItem)

  return result
}
