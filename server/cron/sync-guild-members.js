// server/cron/sync-guild-members.js
import 'dotenv/config'
import fetch from 'node-fetch'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../prisma.js'
import cron from 'node-cron'
import { achievementsQueue, scheduleAuctionClose } from '../../server/utils/queues.js'
import { runTournamentScheduler } from '../../server/utils/gtoonTournament.js'
import { syncWordleResults } from '../../server/utils/wordle.js'
import { checkAndCreateWeeklyCZoneContest } from './create-weekly-czone-contest.js'
import { runEconomyAggregate } from './economy-aggregate.js'
import { runCzoneDisplayCountAggregate } from './czone-display-count.js'
import { getFeaturedDissolveConfig, isCtoonFeatured } from '../utils/featuredDissolveConfig.js'
import { applyDissolveSchedule, getDissolveScheduleConfig } from '../utils/dissolveSchedule.js'
import { logAuctionOnlyError } from '../utils/auctionOnlyErrorLog.js'
import { activateAuctionOnlyRow, AUCTION_ONLY_ROW_INCLUDE } from '../utils/auctionOnlyActivate.js'
import { logCronError } from '../utils/cronErrorLog.js'
import { autoAssignExpiredCMoonUsers } from '../utils/cmoon.js'

const BOT_TOKEN   = process.env.BOT_TOKEN
const ANNOUNCEMENTS_BOT_TOKEN = process.env.DISCORD_ANNOUNCEMENTS_BOT_TOKEN || BOT_TOKEN
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

// This process runs many unrelated cron jobs (Discord sync, achievements,
// AuctionOnly activation, tournament scheduling, ...) back to back at startup
// and hourly. Without these handlers, an unhandled rejection thrown by any one
// of them (e.g. a transient DB blip in a job unrelated to auctions) crashes the
// whole process — silently killing AuctionOnly activation (startDueAuctions)
// along with everything else, with nothing written to AuctionOnlyErrorLog
// since the crash never touches that code path. Keep the process alive and
// record it so it's visible in the admin Error Log instead.
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason))
  console.error('[guild-checker] Unhandled rejection (process kept alive):', reason)
  logAuctionOnlyError('process', err, null).catch(() => {})
  logCronError('process', err).catch(() => {})
})
process.on('uncaughtException', (err) => {
  console.error('[guild-checker] Uncaught exception (process kept alive):', err)
  logAuctionOnlyError('process', err, null).catch(() => {})
  logCronError('process', err).catch(() => {})
})

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Every scheduled job in this file (there are ~20, running back to back at startup and on
// their own cron schedules) gets routed through this wrapper so that:
//   1. one job throwing can never take down the others sharing this process, and
//   2. the failure is recorded to CronErrorLog instead of only living in a log line, so it's
//      visible on the admin Error Logs page.
// The process-level handlers above remain as a last-resort net for anything that still
// manages to escape this (e.g. a rejection from a fire-and-forget promise inside a job).
async function runJob(name, fn) {
  try {
    await fn()
  } catch (err) {
    console.error(`[${name}] failed:`, err)
    await logCronError(name, err)
  }
}

// node-fetch has no default timeout, so a stalled Discord API response would
// otherwise hang the caller forever. This process runs many jobs sequentially
// at startup (see Kickoffs below), so a single unbounded fetch here could
// stall unrelated jobs indefinitely.
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}


async function sendAnnouncementDiscordMessage(row, attempt = 0) {
  try {
    if (!ANNOUNCEMENTS_BOT_TOKEN || !ANNOUNCEMENTS_CHANNEL_ID) return false
    const authHeader = ANNOUNCEMENTS_BOT_TOKEN.startsWith('Bot ')
      ? ANNOUNCEMENTS_BOT_TOKEN
      : `Bot ${ANNOUNCEMENTS_BOT_TOKEN}`
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
  // No inner try/catch: let a failure here propagate to the runJob() wrapper at the call
  // site so it lands in CronErrorLog instead of vanishing silently, as it did for a long
  // time when this only had a bare `catch {}`.
  await prisma.$executeRawUnsafe(sql)
}

const MS_PER_DAY = 86_400_000
function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}
function daysAgo(n) {
  const now = Date.now()
  return new Date(now - n * MS_PER_DAY)
}
async function recordDailyActivity() {
  const now = new Date()
  const end = startOfUtcDay(now)
  const last = await prisma.userDailyActivity.findFirst({
    orderBy: { day: 'desc' },
    select: { day: true }
  })
  
  let start = null
  if (last?.day) {
    start = startOfUtcDay(new Date(last.day))
    start = new Date(start.getTime() + MS_PER_DAY)
  } else {
    const minSql = `
    SELECT MIN(a."createdAt") AS "minDate"
    FROM (
      SELECT "createdAt" FROM "LoginLog"
      UNION ALL
      SELECT "createdAt" FROM "PointsLog" WHERE COALESCE("method", '') NOT LIKE 'achievement:%'
      UNION ALL
      SELECT "createdAt" FROM "GamePointLog"
      UNION ALL
      SELECT "createdAt" FROM "Visit"
      UNION ALL
      SELECT "createdAt" FROM "WheelSpinLog"
      UNION ALL
      SELECT "createdAt" FROM "Bid"
      UNION ALL
      SELECT "createdAt" FROM "TradeOffer"
      UNION ALL
      SELECT "createdAt" FROM "Auction"
    ) a;
    `
    let minDate = null
    try {
      const rows = await prisma.$queryRawUnsafe(minSql)
      minDate = rows?.[0]?.minDate || null
    } catch {}
    if (!minDate) return
    start = startOfUtcDay(new Date(minDate))
  }

  if (start.getTime() >= end.getTime()) return

  const chunkDays = 31
  const sql = `
  INSERT INTO "UserDailyActivity" ("id", "userId", "day")
  SELECT md5(a."userId" || ':' || a."day"::text), a."userId", a."day"
  FROM (
    SELECT "userId", date_trunc('day', "createdAt") AS "day" FROM "LoginLog" WHERE "createdAt" >= $1 AND "createdAt" < $2
    UNION ALL
    SELECT "userId", date_trunc('day', "createdAt") AS "day" FROM "PointsLog" WHERE "createdAt" >= $1 AND "createdAt" < $2 AND COALESCE("method", '') NOT LIKE 'achievement:%'
    UNION ALL
    SELECT "userId", date_trunc('day', "createdAt") AS "day" FROM "GamePointLog" WHERE "createdAt" >= $1 AND "createdAt" < $2
    UNION ALL
    SELECT "userId", date_trunc('day', "createdAt") AS "day" FROM "Visit" WHERE "createdAt" >= $1 AND "createdAt" < $2
    UNION ALL
    SELECT "userId", date_trunc('day', "createdAt") AS "day" FROM "WheelSpinLog" WHERE "createdAt" >= $1 AND "createdAt" < $2
    UNION ALL
    SELECT "userId", date_trunc('day', "createdAt") AS "day" FROM "Bid" WHERE "createdAt" >= $1 AND "createdAt" < $2
    UNION ALL
    SELECT "initiatorId" AS "userId", date_trunc('day', "createdAt") AS "day" FROM "TradeOffer" WHERE "createdAt" >= $1 AND "createdAt" < $2
    UNION ALL
    SELECT "recipientId" AS "userId", date_trunc('day', "createdAt") AS "day" FROM "TradeOffer" WHERE "createdAt" >= $1 AND "createdAt" < $2
    UNION ALL
    SELECT "creatorId" AS "userId", date_trunc('day', "createdAt") AS "day" FROM "Auction" WHERE "createdAt" >= $1 AND "createdAt" < $2 AND "creatorId" IS NOT NULL
  ) a
  GROUP BY a."userId", a."day"
  ON CONFLICT ("userId", "day") DO NOTHING;
  `

  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += chunkDays * MS_PER_DAY) {
    const next = new Date(Math.min(end.getTime(), cursor + chunkDays * MS_PER_DAY))
    try { await prisma.$executeRawUnsafe(sql, new Date(cursor), next) } catch {}
  }
}

async function getVerifiedRoleId() {
  if (!BOT_TOKEN || !GUILD_ID) return null
  const envId = (process.env.DISCORD_VERIFIED_ROLE_ID || '').trim()
  if (envId) return envId

  try {
    const authHeader = BOT_TOKEN.startsWith('Bot ') ? BOT_TOKEN : `Bot ${BOT_TOKEN}`
    const res = await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: authHeader }
    })
    if (!res.ok) return null
    const roles = await res.json()
    const role = Array.isArray(roles) ? roles.find(r => r?.name === 'Verified') : null
    return role?.id || null
  } catch {
    return null
  }
}

async function addRoleToMember(discordUserId, roleId) {
  if (!discordUserId || !roleId || !BOT_TOKEN || !GUILD_ID) return false
  const authHeader = BOT_TOKEN.startsWith('Bot ') ? BOT_TOKEN : `Bot ${BOT_TOKEN}`

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `${DISCORD_API}/guilds/${GUILD_ID}/members/${discordUserId}/roles/${roleId}`,
      { method: 'PUT', headers: { Authorization: authHeader } }
    )
    if (res.status === 204) return true
    if (res.status === 429) {
      let body = { retry_after: 5 }
      try { body = await res.json() } catch {}
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      continue
    }
    return false
  }
  return false
}

async function syncVerifiedRoles() {
  const roleId = await getVerifiedRoleId()
  if (!roleId) return

  let rows = []
  try {
    rows = await prisma.$queryRawUnsafe(`
      SELECT u."id", u."discordId"
      FROM "User" u
      JOIN (
        SELECT "userId"
        FROM "UserDailyActivity"
        GROUP BY "userId"
        HAVING COUNT(*) >= 7
      ) a ON a."userId" = u."id"
      WHERE u."isVerified" = false
        AND u."discordId" IS NOT NULL
        AND u."inGuild" = true
        AND u."active" = true
    `)
  } catch {
    return
  }

  for (const row of rows) {
    const ok = await addRoleToMember(row.discordId, roleId)
    if (!ok) continue
    try {
      await prisma.user.update({ where: { id: row.id }, data: { isVerified: true } })
    } catch {}
  }
}

// Grants each cMoon's Discord role to members who don't have it yet. Add-only —
// never removes a role, matching every other role-grant job in this file.
// Gated by User.cMoonRoleGrantedAt (set once a grant succeeds) instead of a live
// "does the member already have this role" check, so this only ever touches
// newly-joined/never-synced members instead of re-scanning the whole roster daily.
async function syncCMoonDiscordRoles() {
  let rows = []
  try {
    rows = await prisma.$queryRawUnsafe(`
      SELECT u."id", u."discordId", m."discordRoleId"
      FROM "User" u
      JOIN "CMoon" m ON m."id" = u."cMoonId"
      WHERE u."cMoonId" IS NOT NULL
        AND u."cMoonRoleGrantedAt" IS NULL
        AND m."discordRoleId" IS NOT NULL
        AND u."discordId" IS NOT NULL
        AND u."inGuild" = true
        AND u."active" = true
      LIMIT 300
    `)
  } catch {
    return
  }

  for (const row of rows) {
    const ok = await addRoleToMember(row.discordId, row.discordRoleId)
    if (!ok) continue
    try {
      await prisma.user.update({ where: { id: row.id }, data: { cMoonRoleGrantedAt: new Date() } })
    } catch {}
  }
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
// Zero points, transfer UserCtoons to the official account and queue them at
// the front of the dissolve auction queue, disable account.
async function enforceDormantAccounts() {
  const cutoff = daysAgo(270)

  const officialUsername = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  const official = await prisma.user.findUnique({
    where: { username: officialUsername },
    select: { id: true }
  })
  if (!official) {
    console.error(`[enforceDormantAccounts] Official account not found: ${officialUsername}`)
    return
  }

  // fetch batch to avoid huge transactions
  const batch = await prisma.user.findMany({
    where: {
      active: true,
      lastActivity: { lte: cutoff },
    },
    select: { id: true, discordId: true, username: true }
  })

  const featuredConfig = await getFeaturedDissolveConfig()
  let anyQueued = false

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

      // 3.2 transfer UserCtoons to the official account and queue for dissolve auction
      const userCtoons = await tx.userCtoon.findMany({
        where: { userId: u.id, burnedAt: null },
        select: { id: true, mintNumber: true, ctoon: { select: { id: true, rarity: true, series: true, set: true } } }
      })

      for (const uc of userCtoons) {
        const activeAuction = await tx.auction.findFirst({
          where: { userCtoonId: uc.id, status: 'ACTIVE' },
          select: { id: true }
        })

        if (activeAuction) {
          await tx.auction.updateMany({
            where: { userCtoonId: uc.id, status: 'ACTIVE' },
            data: { creatorId: official.id }
          })
          await tx.userCtoon.update({ where: { id: uc.id }, data: { isTradeable: false } })
          continue
        }

        await tx.userCtoon.update({ where: { id: uc.id }, data: { userId: official.id, isTradeable: false } })
        await tx.userTradeListItem.deleteMany({ where: { userCtoonId: uc.id, userId: { not: official.id } } })
        await tx.ctoonOwnerLog.create({
          data: {
            userId: official.id,
            userCtoonId: uc.id,
            ctoonId: uc.ctoon?.id ?? null,
            mintNumber: uc.mintNumber ?? null,
            method: 'DISSOLVE_INACTIVE'
          }
        })

        const isFeatured = isCtoonFeatured(uc.ctoon, featuredConfig)
        const category   = isFeatured ? 'FEATURED' : 'OTHER'

        // priority: true jumps these cToons to the front of the dissolve
        // auction queue, ahead of admin-initiated (non-priority) dissolves
        await tx.dissolveAuctionQueue.upsert({
          where:  { userCtoonId: uc.id },
          update: { priority: true, fromInactive: true, sourceUsername: u.username },
          create: { userCtoonId: uc.id, category, isFeatured, priority: true, fromInactive: true, sourceUsername: u.username }
        })
        anyQueued = true
      }

      // 3.3 disable account
      await tx.user.update({ where: { id: u.id }, data: { active: false } })
    })
  }

  // 3.4 auto-schedule the queue so these priority entries actually launch
  // instead of sitting as "unscheduled" until an admin visits the dissolve
  // queue page. Recomputes every entry (reschedule: true) so the new
  // priority ones jump ahead of already-scheduled non-priority entries.
  if (anyQueued) {
    try {
      const { cadenceDays, featuredPerCadence, otherPerCadence } = await getDissolveScheduleConfig()
      await applyDissolveSchedule({
        startAtUtc: new Date(),
        cadenceDays,
        featuredPerCadence,
        otherPerCadence,
        reschedule: true,
        // Never let the automatic inactivity sweep touch entries a mod
        // hand-scheduled — only an explicit admin "Reschedule All" override can.
        includePinned: false
      })
    } catch (err) {
      console.error('[enforceDormantAccounts] Failed to auto-schedule dissolve queue:', err)
    }
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
      const res = await fetchWithTimeout(
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
  try {
    const now = new Date()

    const due = await prisma.auctionOnly.findMany({
      where: { isStarted: false, startsAt: { lte: now } },
      orderBy: { startsAt: 'asc' },
      include: AUCTION_ONLY_ROW_INCLUDE
    })

    for (const row of due) {
      try {
        await activateAuctionOnlyRow(row)
      } catch (e2) {
        console.error('[startDueAuctions] failed to activate AuctionOnly', row.id, e2)
        await logAuctionOnlyError('activation', e2, row.id)
      }
    }
  } catch (e3) {
    console.error('[startDueAuctions] failed', e3)
    await logAuctionOnlyError('activation', e3, null)
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

async function runTournamentCron() {
  try {
    await runTournamentScheduler(prisma)
  } catch (e) {
    // ignore in cron context
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kickoffs
//
// AuctionOnly go-live (startDueAuctions) is registered and kicked off first,
// and deliberately NOT top-level-awaited: every call below it in this file
// hits Discord's API with no fetch timeout, so a slow/hanging response from
// any one of them (e.g. syncGuildMembers, which paginates the full guild
// member list) would otherwise block this script from ever reaching the
// `cron.schedule('1 * * * *', startDueAuctions)` line — silently preventing
// scheduled auctions from ever going live, even though nothing crashed.
cron.schedule('1 * * * *', () => runJob('startDueAuctions', startDueAuctions))  // hourly at minute 1
runJob('startDueAuctions', startDueAuctions)

await runJob('syncGuildMembers', syncGuildMembers)
cron.schedule('0 0 * * *', () => runJob('syncGuildMembers', syncGuildMembers))  // daily midnight

await runJob('sendDueAnnouncements', sendDueAnnouncements)
cron.schedule('*/5 * * * *', () => runJob('sendDueAnnouncements', sendDueAnnouncements))

await runJob('markScheduledPacksInCmart', markScheduledPacksInCmart)
cron.schedule('0 * * * *', () => runJob('markScheduledPacksInCmart', markScheduledPacksInCmart))

await runJob('recordDailyActivity', recordDailyActivity)
await runJob('syncVerifiedRoles', syncVerifiedRoles)
cron.schedule('30 2 * * *', () => runJob('recordDailyActivity', recordDailyActivity), { timezone: 'America/Chicago' }) // 02:30 CST daily
cron.schedule('35 2 * * *', () => runJob('syncVerifiedRoles', syncVerifiedRoles), { timezone: 'America/Chicago' }) // 02:35 CST daily

// cMoon: auto-assign anyone past their pick-a-cMoon deadline, then grant Discord
// role flair to newly-assigned/newly-selected members. Off by default via
// GlobalGameConfig.cMoonEnabled — both jobs no-op immediately when disabled.
await runJob('autoAssignExpiredCMoonUsers', autoAssignExpiredCMoonUsers)
await runJob('syncCMoonDiscordRoles', syncCMoonDiscordRoles)
cron.schedule('40 2 * * *', () => runJob('autoAssignExpiredCMoonUsers', autoAssignExpiredCMoonUsers), { timezone: 'America/Chicago' }) // 02:40 CST daily
cron.schedule('45 2 * * *', () => runJob('syncCMoonDiscordRoles', syncCMoonDiscordRoles), { timezone: 'America/Chicago' }) // 02:45 CST daily

await runJob('recomputeLastActivity', recomputeLastActivity)
cron.schedule('0 4 * * *', () => runJob('recomputeLastActivity', recomputeLastActivity), { timezone: 'America/Chicago' })  // 04:00 CST daily

await runJob('sendInactivityWarnings', sendInactivityWarnings)
cron.schedule('0 3 * * *', () => runJob('sendInactivityWarnings', sendInactivityWarnings))    // 03:00 daily

await runJob('updateWinballGrandPrizeFromSchedule', updateWinballGrandPrizeFromSchedule)
cron.schedule('0 * * * *', () => runJob('updateWinballGrandPrizeFromSchedule', updateWinballGrandPrizeFromSchedule))  // hourly at minute 0

await runJob('enforceDormantAccounts', enforceDormantAccounts)
cron.schedule('0 4 * * *', () => runJob('enforceDormantAccounts', enforceDormantAccounts))    // 04:00 daily

// Sync Wordle daily crown results from Discord
async function syncWordleResultsDaily() {
  try {
    await syncWordleResults()
  } catch (e) {
    console.error('[wordle-cron] Error during Wordle sync:', e?.message)
    await logCronError('syncWordleResultsDaily', e)
  }
}

// Enqueue daily achievements processing at 03:00 CST
async function enqueueAchievementsDaily() {
  try {
    const users = await prisma.user.findMany({ where: { active: true, banned: false }, select: { id: true } })
    for (const u of users) {
      await achievementsQueue.add('processUserAchievements', { userId: u.id })
    }
  } catch (e) {
    await logCronError('enqueueAchievementsDaily', e)
  }
}

// await enqueueAchievementsDaily()
cron.schedule('0 3 * * *', () => runJob('enqueueAchievementsDaily', enqueueAchievementsDaily), { timezone: 'America/Chicago' })

// Sync Wordle results at 10:00 CST daily (after the bot's morning post)
await runJob('syncWordleResultsDaily', syncWordleResultsDaily)
cron.schedule('0 10 * * *', () => runJob('syncWordleResultsDaily', syncWordleResultsDaily), { timezone: 'America/Chicago' })


await runJob('runTournamentCron', runTournamentCron)
cron.schedule('*/15 * * * *', () => runJob('runTournamentCron', runTournamentCron))

// Weekly cZone contest auto-creation — runs every minute and checks if it's time
cron.schedule('* * * * *', () => runJob('checkAndCreateWeeklyCZoneContest', checkAndCreateWeeklyCZoneContest), { timezone: 'America/Chicago' })

// Economy page daily price/volume aggregation — offset from the 3am achievements
// run to avoid overlapping load on Auction/UserCtoon tables. Also kicked off once
// on startup (advisory-lock + cursor guarded) so a fresh deploy doesn't wait until
// 4:10am for data. Deliberately not awaited: the first run backfills all history
// and must not delay registering the schedules below.
//
// Belt-and-suspenders only: server/utils/economyFreshness.js already triggers
// this same aggregation on demand (Redis-gated) from the Economy API routes
// themselves, so the page stays fresh even if this worker process isn't
// running. This schedule just keeps data warm proactively when it is.
runJob('runEconomyAggregate', runEconomyAggregate)
cron.schedule('10 4 * * *', () => runJob('runEconomyAggregate', runEconomyAggregate), { timezone: 'America/Chicago' })

await runJob('runCzoneDisplayCountAggregate', runCzoneDisplayCountAggregate)
cron.schedule('0 5 * * *', () => runJob('runCzoneDisplayCountAggregate', runCzoneDisplayCountAggregate), { timezone: 'America/Chicago' })  // 05:00 CST daily
