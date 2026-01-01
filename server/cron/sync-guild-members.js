// server/cron/sync-guild-members.js
import 'dotenv/config'
import fetch from 'node-fetch'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../prisma.js'
import cron from 'node-cron'
import { achievementsQueue } from '../../server/utils/queues.js'

const BOT_TOKEN   = process.env.BOT_TOKEN
const GUILD_ID    = process.env.DISCORD_GUILD_ID
const DISCORD_API = 'https://discord.com/api/v10'
const ANNOUNCEMENTS_CHANNEL_ID = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL
const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..')
  : process.cwd()
const announcementsDir = (process.env.PUBLIC_BASE_URL || process.env.NODE_ENV === 'production')
  ? join(baseDir, 'cartoon-reorbit-images', 'announcements')
  : join(baseDir, 'public', 'announcements')

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function sendAuctionDiscordAnnouncement(result, isHolidayItem = false) {
  try {
    const botToken = process.env.BOT_TOKEN
    const guildId  = process.env.DISCORD_GUILD_ID

    if (!botToken || !guildId) {
      console.error('Missing BOT_TOKEN or DISCORD_GUILD_ID env vars.')
      return
    }

    const authHeader =
      botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`

    // 1) Look up the "cmart-alerts" channel by name
    const channelsRes = await fetch(
      `${DISCORD_API}/guilds/${guildId}/channels`,
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

    const baseUrl =
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
      `${DISCORD_API}/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
  } catch (e1) {
    // swallow in cron context
  }
}

async function sendAnnouncementDiscordMessage(row, attempt = 0) {
  try {
    if (!BOT_TOKEN || !ANNOUNCEMENTS_CHANNEL_ID) return false
    const authHeader = BOT_TOKEN.startsWith('Bot ') ? BOT_TOKEN : `Bot ${BOT_TOKEN}`
    const nativeFetch = globalThis.fetch || fetch
    const canAttach = typeof globalThis.FormData === 'function' && typeof globalThis.Blob === 'function'

    const content = row.pingOption ? `${row.pingOption} ${row.message}` : row.message
    const baseUrl =
      process.env.PUBLIC_BASE_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://www.cartoonreorbit.com'
        : `http://localhost:${process.env.SOCKET_PORT || 3000}`)

    async function sendWithAttachments(files) {
      const fd = new FormData()
      fd.append('payload_json', JSON.stringify({
        content,
        attachments: files.map((file, idx) => ({ id: idx, filename: file.filename }))
      }))
      files.forEach((file, idx) => {
        fd.append(`files[${idx}]`, new Blob([file.buffer]), file.filename)
      })

      const res = await nativeFetch(
        `${DISCORD_API}/channels/${ANNOUNCEMENTS_CHANNEL_ID}/messages`,
        {
          method: 'POST',
          headers: { Authorization: authHeader },
          body: fd
        }
      )

      if (res.status === 429 && attempt < 2) {
        let body = { retry_after: 5 }
        try { body = await res.json() } catch {}
        await sleep(Math.ceil((body.retry_after || 5) * 1000))
        return sendAnnouncementDiscordMessage(row, attempt + 1)
      }

      return res.ok
    }

    const imageSlots = [
      { imagePath: row.imagePath, imageFilename: row.imageFilename },
      { imagePath: row.imagePath2, imageFilename: row.imageFilename2 },
      { imagePath: row.imagePath3, imageFilename: row.imageFilename3 },
    ]
    const attachments = []
    if (canAttach) {
      for (const slot of imageSlots) {
        if (attachments.length >= 3) break
        if (!slot?.imagePath && !slot?.imageFilename) continue
        const pathFilename = slot.imagePath
          ? decodeURIComponent(String(slot.imagePath).split('/').pop() || '')
          : ''
        const attachmentName = slot.imageFilename || pathFilename || ''
        if (attachmentName) {
          try {
            const filePath = join(announcementsDir, attachmentName)
            const fileBuf = await readFile(filePath)
            attachments.push({ buffer: fileBuf, filename: attachmentName })
            continue
          } catch {
            // fall through to URL attachment
          }
        }
        if (slot.imagePath) {
          try {
            const rawUrl = slot.imagePath.startsWith('http') ? slot.imagePath : `${baseUrl}${slot.imagePath}`
            const imageUrl = encodeURI(rawUrl)
            const imgRes = await nativeFetch(imageUrl)
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer())
              const fallbackName = attachmentName || imageUrl.split('/').pop() || 'announcement-image'
              attachments.push({ buffer: buf, filename: fallbackName })
            }
          } catch {
            // fall through to content-only send
          }
        }
      }
    }

    if (attachments.length) {
      return await sendWithAttachments(attachments)
    }

    const payload = { content }

    const res = await nativeFetch(
      `${DISCORD_API}/channels/${ANNOUNCEMENTS_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    if (res.status === 429 && attempt < 2) {
      let body = { retry_after: 5 }
      try { body = await res.json() } catch {}
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      return sendAnnouncementDiscordMessage(row, attempt + 1)
    }

    return res.ok
  } catch {
    return false
  }
}

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
              isFeatured: fresh.isFeatured,        // ← carry flag onto Auction
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
            ctoonId: row.userCtoon.ctoon.id,
            isFeatured: fresh.isFeatured,        // optional, if you ever need it downstream
          }
        })

        if (!result) continue

        // Holiday flag for messaging
        const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
          where: { ctoonId: result.ctoonId },
          select: { id: true }
        }))

        // Discord notification (best effort)
        await sendAuctionDiscordAnnouncement(result, isHolidayItem)
      } catch (e2) {
      }
    }
  } catch (e3) {
  }
}

async function sendDueAnnouncements() {
  try {
    if (!ANNOUNCEMENTS_CHANNEL_ID) return
    const now = new Date()
    const claimCutoff = new Date(Date.now() - 10 *60 * 1000)
    while (true) {
      const due = await prisma.announcement.findMany({
        where: {
          sentAt: null,
          scheduledAt: { lte: now },
          OR: [
            { sendingAt: null },
            { sendingAt: { lt: claimCutoff } }
          ]
        },
        orderBy: { scheduledAt: 'asc' },
        take: 50
      })
      if (!due.length) break

      for (const row of due) {
        const claim = await prisma.announcement.updateMany({
          where: {
            id: row.id,
            sentAt: null,
            OR: [
              { sendingAt: null },
              { sendingAt: { lt: claimCutoff } }
            ]
          },
          data: { sendingAt: new Date() }
        })
        if (!claim.count) continue

        const latest = await prisma.announcement.findUnique({
          where: { id: row.id },
          select: {
            id: true,
            message: true,
            pingOption: true,
            imagePath: true,
            imageFilename: true,
            imagePath2: true,
            imageFilename2: true,
            imagePath3: true,
            imageFilename3: true,
            sentAt: true,
            sendingAt: true
          }
        })
        if (latest?.sentAt) continue
        const ok = await sendAnnouncementDiscordMessage(latest || row)
        if (!ok) {
          await prisma.announcement.update({
            where: { id: row.id },
            data: {
              sendingAt: null,
              sendError: 'Failed to send announcement to Discord.',
              sendErrorAt: new Date()
            }
          })
        } else {
          await prisma.announcement.update({
            where: { id: row.id },
            data: {
              sentAt: new Date(),
              sendingAt: null,
              sendError: null,
              sendErrorAt: null
            }
          })
        }
      }
    }
  } catch (e) {
    console.error('[sendDueAnnouncements] error:', e)
  }
}

async function markScheduledPacksInCmart() {
  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    await prisma.pack.updateMany({
      where: {
        sentAt: null,
        scheduledAt: { lte: now },
        scheduledOffAt: null
      },
      data: { inCmart: true, sentAt: now }
    })
    await prisma.pack.updateMany({
      where: {
        scheduledOffAt: { gt: oneHourAgo, lte: now }
      },
      data: { inCmart: false }
    })
  } catch {
    // swallow in cron context
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Winball: set current grand prize from schedule (runs hourly)
async function updateWinballGrandPrizeFromSchedule() {
  try {
    const now = new Date()

    // 1) Latest schedule row that is active as of "now"
    const sched = await prisma.winballGrandPrizeSchedule.findFirst({
      where: { startsAt: { lte: now } },
      orderBy: { startsAt: 'desc' },
      select: { id: true, ctoonId: true }
    })
    if (!sched) return

    // 2) Load or create Winball config
    let cfg = await prisma.gameConfig.findUnique({
      where: { gameName: 'Winball' },
      select: { id: true, grandPrizeCtoonId: true }
    })

    if (!cfg) {
      // create minimal config if missing
      await prisma.gameConfig.create({
        data: {
          gameName: 'Winball',
          leftCupPoints: 0,
          rightCupPoints: 0,
          goldCupPoints: 0,
          grandPrizeCtoonId: sched.ctoonId
        }
      })
      return
    }

    // 3) Update only if changed
    if (cfg.grandPrizeCtoonId !== sched.ctoonId) {
      await prisma.gameConfig.update({
        where: { id: cfg.id },
        data: {
          grandPrizeCtoonId: sched.ctoonId,
          updatedAt: new Date()
        }
      })
    }
  } catch (e) {
    // swallow in cron context
  }
}

async function createDailyFeaturedAuction() {
  const username = process.env.OFFICIAL_USERNAME
  if (!username) return

  const officialUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true }
  })
  if (!officialUser) return

  const candidates = await prisma.userCtoon.findMany({
    where: {
      userId: officialUser.id,
      burnedAt: null,
      ctoon: {
        rarity: { not: "Crazy Rare" }
      }
    },
    include: {
      ctoon: {
        select: { id: true, name: true, rarity: true, assetPath: true }
      }
    }
  })

  if (!candidates.length) return

  const rarityFloor = (r) => {
    const s = (r || "").trim().toLowerCase()
    if (s === "common") return 25
    if (s === "uncommon") return 50
    if (s === "rare") return 100
    if (s === "very rare") return 187
    if (s === "crazy rare") return 312
    return 50
  }

  const idx = Math.floor(Math.random() * candidates.length)
  const chosen = candidates[idx]
  const now = new Date()
  const durationDays = 1
  const endAt = new Date(now.getTime() + durationDays * 86_400_000)
  const initialBet = rarityFloor(chosen.ctoon?.rarity)

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.auction.findFirst({
      where: { userCtoonId: chosen.id, status: "ACTIVE" },
      select: { id: true }
    })
    if (existing) return null

    const created = await tx.auction.create({
      data: {
        userCtoonId: chosen.id,
        initialBet,
        duration: durationDays,
        endAt,
        creatorId: officialUser.id,
        isFeatured: true
      },
      select: { id: true }
    })

    await tx.userCtoon.update({
      where: { id: chosen.id },
      data: { isTradeable: false }
    })

    return {
      auctionId: created.id,
      initialBet,
      durationDays,
      ctoon: chosen.ctoon,
      mintNumber: chosen.mintNumber,
      ctoonId: chosen.ctoonId
    }
  })

  if (!result) return

  const isHolidayItem = !!(await prisma.holidayEventItem.findFirst({
    where: { ctoonId: result.ctoonId },
    select: { id: true }
  }))

  await sendAuctionDiscordAnnouncement(result, isHolidayItem)
}

// ─────────────────────────────────────────────────────────────────────────────
// Kickoffs
await syncGuildMembers()
cron.schedule('0 0 * * *', syncGuildMembers)  // daily midnight

await startDueAuctions()
// start AuctionOnly auctions
cron.schedule('1 * * * *', startDueAuctions)  // hourly at minute 1

await sendDueAnnouncements()
cron.schedule('*/5 * * * *', sendDueAnnouncements)

await markScheduledPacksInCmart()
cron.schedule('0 * * * *', markScheduledPacksInCmart)

await recomputeLastActivity()
cron.schedule('0 2 * * *', recomputeLastActivity)      // 02:00 daily

await sendInactivityWarnings()
cron.schedule('0 3 * * *', sendInactivityWarnings)    // 03:00 daily

await updateWinballGrandPrizeFromSchedule()
cron.schedule('0 * * * *', updateWinballGrandPrizeFromSchedule)  // hourly at minute 0

await enforceDormantAccounts()
cron.schedule('0 4 * * *', enforceDormantAccounts)    // 04:00 daily

// create daily featured auction at 08:00
cron.schedule("0 8 * * *", createDailyFeaturedAuction, { timezone: "America/Chicago" })

// Enqueue daily achievements processing at 03:00 CST
async function enqueueAchievementsDaily() {
  try {
    const users = await prisma.user.findMany({ where: { active: true, banned: false }, select: { id: true } })
    for (const u of users) {
      await achievementsQueue.add('processUserAchievements', { userId: u.id })
    }
  } catch (e) {
    // ignore in cron context
  }
}

await enqueueAchievementsDaily()
cron.schedule('0 3 * * *', enqueueAchievementsDaily, { timezone: 'America/Chicago' })
