// server/cron/sync-guild-members.js
import 'dotenv/config'
import fetch from 'node-fetch'
import { prisma } from '../prisma.js'
import cron from 'node-cron'

const BOT_TOKEN   = process.env.BOT_TOKEN
const GUILD_ID    = process.env.DISCORD_GUILD_ID
const DISCORD_API = 'https://discord.com/api/v10'

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function discordDm(discordUserId, content) {
  if (!BOT_TOKEN) return false
  try {
    // 1) create or get DM channel
    const ch = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: 'POST',
      headers: { Authorization: `${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: discordUserId })
    })
    if (ch.status === 429) {
      let body = { retry_after: 5 }
      try { body = await ch.json() } catch {}
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      return discordDm(discordUserId, content)
    }
    if (!ch.ok) return false
    const { id: channelId } = await ch.json()

    // 2) send message
    const msg = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    if (msg.status === 429) {
      let body = { retry_after: 5 }
      try { body = await msg.json() } catch {}
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      return discordDm(discordUserId, content)
    }
    return msg.ok
  } catch {
    return false
  }
}

async function recomputeLastActivity() {
  // Note: PostgreSQL quoted identifiers must match your table/column names.
  const sql = `
  UPDATE "User" u SET "lastActivity" = GREATEST(
    COALESCE(u."lastLogin", TIMESTAMP 'epoch'),
    COALESCE( (SELECT MAX(l."createdAt") FROM "LoginLog" l WHERE l."userId" = u."id"),   TIMESTAMP 'epoch'),
    COALESCE( (SELECT MAX(p."createdAt") FROM "PointsLog" p WHERE p."userId" = u."id"),  TIMESTAMP 'epoch'),
    COALESCE( (SELECT MAX(g."createdAt") FROM "GamePointLog" g WHERE g."userId" = u."id"), TIMESTAMP 'epoch'),
    COALESCE( (SELECT MAX(v."createdAt") FROM "Visit" v WHERE v."userId" = u."id"),      TIMESTAMP 'epoch'),
    COALESCE( (SELECT MAX(w."createdAt") FROM "WheelSpinLog" w WHERE w."userId" = u."id"), TIMESTAMP 'epoch'),
    COALESCE(u."createdAt", TIMESTAMP 'epoch')
  )
  WHERE TRUE;`
  try { await prisma.$executeRawUnsafe(sql) } catch {}
}

const MS_PER_DAY = 86_400_000
function daysAgo(n) {
  const now = Date.now()
  return new Date(now - n * MS_PER_DAY)
}
function addDays(date, n) {
  return new Date(date.getTime() + n * MS_PER_DAY)
}

async function sendInactivityWarnings() {
  const d180 = daysAgo(180)
  const d210 = daysAgo(210)
  const d240 = daysAgo(240)

  // 180-day warnings
  const users180 = await prisma.user.findMany({
    where: {
      active: true,
      warning180: false,
      lastActivity: { lte: d180 },
    },
    select: { id: true, discordId: true }
  })
  for (const u of users180) {
    const ok = u.discordId ? await discordDm(
      u.discordId,
      `You have been inactive for 6 months. If you are inactive for 9 months, your account will be disabled and all cToons auctioned and points removed.`
    ) : false
    if (ok) {
      await prisma.user.update({ where: { id: u.id }, data: { warning180: true } })
    }
  }

  // 210-day warnings
  const users210 = await prisma.user.findMany({
    where: {
      active: true,
      warning210: false,
      lastActivity: { lte: d210 },
    },
    select: { id: true, discordId: true }
  })
  for (const u of users210) {
    const ok = u.discordId ? await discordDm(
      u.discordId,
      `You have been inactive for 7 months. At 9 months of inactivity your account will be disabled and your cToons will be auctioned with points removed.`
    ) : false
    if (ok) {
      await prisma.user.update({ where: { id: u.id }, data: { warning210: true } })
    }
  }

  // 240-day warnings
  const users240 = await prisma.user.findMany({
    where: {
      active: true,
      warning240: false,
      lastActivity: { lte: d240 },
    },
    select: { id: true, discordId: true }
  })
  for (const u of users240) {
    const ok = u.discordId ? await discordDm(
      u.discordId,
      `You have been inactive for 8 months. At 9 months of inactivity your account will be disabled and your cToons will be auctioned with points removed.`
    ) : false
    if (ok) {
      await prisma.user.update({ where: { id: u.id }, data: { warning240: true } })
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) enforce at 270 days, 02:20
// Zero points, schedule auctions for all UserCtoons, disable account.
async function enforceDormantAccounts() {
  const cutoff = daysAgo(270)

  // fetch batch to avoid huge transactions
  const batch = await prisma.user.findMany({
    where: {
      active: true,
      lastActivity: { lte: cutoff },
    },
    select: { id: true, discordId: true }
  })

  for (const u of batch) {
    // DM best-effort
    if (u.discordId) {
      await discordDm(
        u.discordId,
        `Your account has been inactive for 9 months. Your account is now disabled, your points have been removed, and your cToons are being prepared for auction.`
      )
    }

    // transactional enforcement per user
    await prisma.$transaction(async (tx) => {
      // 3.1 zero points
      const up = await tx.userPoints.findUnique({ where: { userId: u.id } })
      if (up?.points && up.points !== 0) {
        await tx.pointsLog.create({
          data: {
            userId: u.id,
            direction: 'decrease',
            points: up.points,
            total: 0,
            method: 'inactive_270d'
          }
        })
        await tx.userPoints.update({
          where: { userId: u.id },
          data: { points: 0, updatedAt: new Date() }
        })
      }

      // 3.2 move all UserCtoons to AuctionOnly (skip ones already auctioned/listed)
      const userCtoons = await tx.userCtoon.findMany({
        where: { userId: u.id, burnedAt: null },
        select: { id: true, ctoon: { select: { rarity: true } } }
      })
      const now = new Date()
      const endsAt = addDays(now, 3)
      const rarityFloor = (r) => {
        const s = (r || '').trim().toLowerCase()
        if (s === 'common') return 25
        if (s === 'uncommon') return 50
        if (s === 'rare') return 100
        if (s === 'very rare') return 187
        if (s === 'crazy rare') return 312
        return 50
      }

      for (const uc of userCtoons) {
        // ensure not already active auction
        const hasActive = await tx.auction.findFirst({
          where: { userCtoonId: uc.id, status: 'ACTIVE' },
          select: { id: true }
        })
        const hasPending = await tx.auctionOnly.findFirst({
          where: { userCtoonId: uc.id, isStarted: false },
          select: { id: true }
        })
        if (hasActive || hasPending) continue

        await tx.auctionOnly.create({
          data: {
            userCtoonId: uc.id,
            pricePoints: rarityFloor(uc.ctoon?.rarity),
            startsAt: now,
            endsAt,
            isStarted: false,
          }
        })

        // lock tradeability to avoid private transfers
        await tx.userCtoon.update({
          where: { id: uc.id },
          data: { isTradeable: false }
        })
      }

      // 3.3 disable account
      await tx.user.update({ where: { id: u.id }, data: { active: false } })
    })
  }
}

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
              endAt: new Date(fresh.endsAt),
              creatorId: row.userCtoon?.creatorId,
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
// start AuctionOnly auctions
cron.schedule('1 * * * *', startDueAuctions)  // hourly at minute 1

await recomputeLastActivity()
cron.schedule('0 2 * * *', recomputeLastActivity)      // 02:00 daily

await sendInactivityWarnings()
cron.schedule('0 3 * * *', sendInactivityWarnings)    // 03:00 daily

await enforceDormantAccounts()
cron.schedule('0 4 * * *', enforceDormantAccounts)    // 04:00 daily

// update log in logic to not let inactive users log in
// update cZone page to only show active users
// allow creation of a new account with existing discordId if old one is inactive