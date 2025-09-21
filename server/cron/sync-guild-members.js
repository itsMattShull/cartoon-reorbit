// server/cron/sync-guild-members.js
import 'dotenv/config'
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'
import cron from 'node-cron'

const BOT_TOKEN   = process.env.BOT_TOKEN
const GUILD_ID    = process.env.DISCORD_GUILD_ID
const DISCORD_API = 'https://discord.com/api/v10'

// ─────────────────────────────────────────────────────────────────────────────
// Existing: guild sync
async function syncGuildMembers() {
  try {
    let after = '0'
    const memberIds = []
    const memberList = []

    while (true) {
      const res = await fetch(
        `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
        { headers: { Authorization: `${BOT_TOKEN}` } }
      )
      if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`)

      const batch = await res.json()
      if (!Array.isArray(batch) || batch.length === 0) break

      batch.forEach(m => {
        memberIds.push(m.user.id)
        memberList.push(m)
      })
      after = batch[batch.length - 1].user.id
      if (batch.length < 1000) break
    }

    await prisma.user.updateMany({
      where: { discordId: { in: memberIds }, inGuild: false },
      data:  { inGuild: true }
    })
    await prisma.user.updateMany({
      where: { inGuild: true, discordId: { notIn: memberIds } },
      data:  { inGuild: false }
    })

    const nonBoosterIds = memberList
      .filter(m => m.premium_since === null)
      .map(m => m.user.id)
    if (nonBoosterIds.length) {
      await prisma.user.updateMany({
        where: { discordId: { in: nonBoosterIds } },
        data:  { isBooster: false, boosterSince: null }
      })
    }

    const boosterMembers = memberList.filter(m => m.premium_since !== null)
    for (const m of boosterMembers) {
      await prisma.user.updateMany({
        where: { discordId: m.user.id },
        data: {
          isBooster:   true,
          boosterSince: new Date(m.premium_since)
        }
      })
    }

    const dbUsers = await prisma.user.findMany({
      where: { discordId: { in: memberIds } },
      select: { discordId: true, username: true }
    })
    const nameMap = new Map(dbUsers.map(u => [u.discordId, u.username]))

    const updated = []
    for (const m of memberList) {
      const dbName = nameMap.get(m.user.id)
      if (!dbName || m.nick === dbName) continue

      let attempts = 0
      let done     = false

      while (!done && attempts < 3) {
        attempts++
        const patch = await fetch(
          `${DISCORD_API}/guilds/${GUILD_ID}/members/${m.user.id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `${BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nick: dbName })
          }
        )

        if (patch.ok) {
          updated.push(`${m.user.id}→${dbName}`)
          done = true
        } else if (patch.status === 429) {
          let body = { retry_after: 5 }
          try { body = await patch.json() } catch {}
          const waitMs = (body.retry_after || 5) * 1000
          await new Promise(r => setTimeout(r, waitMs))
        } else {
          let err = {}
          try { err = await patch.json() } catch {}
          if (err.code !== 50013) {}
          done = true
        }
      }
    }
  } catch (err) {
    // console.error('[sync-guild] sync failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// Runs at HH:01 via cron.schedule('1 * * * *', startDueAuctions)
async function startDueAuctions() {
  const rarityFloor = (r) => {
    const s = (r || '').trim().toLowerCase()
    if (s === 'common') return 25
    if (s === 'uncommon') return 50
    if (s === 'rare') return 100
    if (s === 'very rare') return 187
    if (s === 'crazy rare') return 312
    return 50
  }

  try {
    const now = new Date()

    const due = await prisma.auctionOnly.findMany({
      where: { isStarted: false, startsAt: { lte: now } },
      orderBy: { startsAt: 'asc' },
      include: {
        userCtoon: {
          select: {
            id: true,
            mintNumber: true,
            ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
          }
        }
      }
    })

    for (const row of due) {
      try {
        // Transaction: double-check state, create auction, lock tradeability, mark started
        const result = await prisma.$transaction(async (tx) => {
          const fresh = await tx.auctionOnly.findUnique({
            where: { id: row.id },
            select: {
              id: true,
              isStarted: true,
              userCtoonId: true,
              pricePoints: true,
              startsAt: true,
              endsAt: true
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

          const floor = rarityFloor(row.userCtoon?.ctoon?.rarity)
          const initialBet = Math.max(Number(fresh.pricePoints || 0), floor)

          const ms = new Date(fresh.endsAt).getTime() - new Date(fresh.startsAt).getTime()
          const durationDays = Math.max(1, Math.min(5, Math.round(ms / 86400000) || 1))

          const created = await tx.auction.create({
            data: {
              userCtoonId: fresh.userCtoonId,
              initialBet,
              duration: durationDays,
              endAt: new Date(fresh.endsAt)
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
            initialBet,
            durationDays,
            ctoon: row.userCtoon.ctoon,
            mintNumber: row.userCtoon.mintNumber,
            ctoonId: row.userCtoon.ctoon.id
          }
        })

        if (!result) continue

        // Holiday flag for messaging
        const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
          where: { ctoonId: result.ctoonId },
          select: { id: true }
        }))

        // Discord notification (best effort)
        try {
          const botToken  = process.env.BOT_TOKEN
          const channelId = process.env.AUCTION_CHANNEL_ID || '1401244687163068528'
          const baseUrl   =
            process.env.PUBLIC_BASE_URL ||
            (process.env.NODE_ENV === 'production'
              ? 'https://www.cartoonreorbit.com'
              : `http://localhost:${process.env.SOCKET_PORT || 3000}`)

          const { name, rarity, assetPath } = result.ctoon || {}
          const auctionLink = `${baseUrl}/auction/${result.auctionId}`
          const rawImageUrl = assetPath
            ? (assetPath.startsWith('http') ? assetPath : `${baseUrl}${assetPath}`)
            : null
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
        } catch {}
      } catch {}
    }
  } catch {}
}


// ─────────────────────────────────────────────────────────────────────────────
// Kickoffs
await syncGuildMembers()
cron.schedule('0 0 * * *', syncGuildMembers)  // daily midnight

await startDueAuctions()
cron.schedule('1 * * * *', startDueAuctions)  // hourly at minute 1
