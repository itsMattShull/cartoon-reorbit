// server/cron/jobHandlers.js
//
// The bodies of every scheduled background job (Discord sync, AuctionOnly go-live, pack
// scheduling, announcements, achievements enqueue, activity/economy aggregates, ...), exported as
// JOB_HANDLERS at the bottom. This file deliberately has NO top-level side effects: nothing is
// scheduled or kicked off at import time. Scheduling lives in server/cron/scheduler.js (two
// processes: "critical" and "maintenance" — see server/cron/jobs.js for which job belongs to which
// and when it fires), and every run is timed/recorded by server/cron/runLogger.js. A handler that
// fails must THROW (never swallow) so the run is recorded as FAILED on the admin Cron Run Logs page.
import 'dotenv/config'
import fetch from 'node-fetch'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../prisma.js'
import { enqueueAchievementChecks } from '../utils/queues.js'
import { runTournamentScheduler } from '../../server/utils/gtoonTournament.js'
import { syncWordleResults } from '../../server/utils/wordle.js'
import { checkAndCreateWeeklyCZoneContest } from './create-weekly-czone-contest.js'
import { checkAndPostWeeklyRiddle } from './cmoon-riddle-rotation.js'
import { checkAndPostWeeklyCMoonRecap } from './cmoon-weekly-recap.js'
import { runEconomyAggregate } from './economy-aggregate.js'
import { runCzoneDisplayCountAggregate } from './czone-display-count.js'
import { getFeaturedDissolveConfig, isCtoonFeatured } from '../utils/featuredDissolveConfig.js'
import { applyDissolveSchedule, getDissolveScheduleConfig } from '../utils/dissolveSchedule.js'
import { logAuctionOnlyError } from '../utils/auctionOnlyErrorLog.js'
import { activateAuctionOnlyRow, AUCTION_ONLY_ROW_INCLUDE } from '../utils/auctionOnlyActivate.js'
import { logCronError } from '../utils/cronErrorLog.js'
import { USER_TABLE_BULK_WRITE_LOCK_KEY } from '../utils/dbLocks.js'
import { pruneCronLogs } from './runLogger.js'
import { runCMoonPointsAggregate } from './cmoon-points-aggregate.js'
import { runRecordDailyTaskCompletions } from './record-daily-task-completions.js'
import { checkAndRunCMoonDailyScoring } from './cmoon-daily-score.js'
import { reconcileHolidayRedemptions } from './reconcile-holiday-redemptions.js'

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

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

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
          body: fd,
          signal: AbortSignal.timeout(30000)
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
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
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

async function discordDm(discordUserId, content, attempt = 0) {
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
      if (attempt >= 3) return false
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      return discordDm(discordUserId, content, attempt + 1)
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
      if (attempt >= 3) return false
      await sleep(Math.ceil((body.retry_after || 5) * 1000))
      return discordDm(discordUserId, content, attempt + 1)
    }
    return msg.ok
  } catch {
    return false
  }
}

async function recomputeLastActivity() {
  // This is a full-table UPDATE...FROM-shaped statement (via correlated subqueries), same
  // as runCMoonPointsAggregate's (server/cron/cmoon-points-aggregate.js) recompute of
  // "User"."cMoonPoints". Two such statements running at once lock overlapping User rows
  // in whatever order their own query plan happens to visit them — which doesn't agree
  // between the two — and Postgres deadlocks one of them. Sharing that job's advisory
  // lock key (see server/utils/dbLocks.js) serializes the two instead: whoever loses just
  // skips and picks the work up on its own next scheduled tick.
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${USER_TABLE_BULK_WRITE_LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    console.log('[recomputeLastActivity] another bulk User-table job holds the lock, skipping')
    return { skipped: true, reason: 'advisory lock held by another bulk User-table job' }
  }
  try {
    // Done in id-ordered batches, each its own short statement/transaction, instead of one
    // full-table UPDATE. A single UPDATE holds row locks on every User row it has touched
    // until it finishes (minutes on a big table), so any single-row write to User in that
    // window — most visibly the login callback's `lastLogin` update — blocks behind it.
    // Short batches release their locks after a fraction of a second.
    // No inner try/catch: let a failure here propagate to the runJob() wrapper at the call
    // site so it lands in CronErrorLog instead of vanishing silently, as it did for a long
    // time when this only had a bare `catch {}`.
    const BATCH_SIZE = 100
    let lastId = ''
    for (;;) {
      const ids = await prisma.$queryRaw`SELECT id FROM "User" WHERE id > ${lastId} ORDER BY id LIMIT ${BATCH_SIZE}`
      if (!ids.length) break
      const batchEnd = ids[ids.length - 1].id
      // Note: PostgreSQL quoted identifiers must match your table/column names.
      await prisma.$executeRaw`
        UPDATE "User" u SET "lastActivity" = GREATEST(
          COALESCE(u."lastLogin", TIMESTAMP 'epoch'),
          COALESCE( (SELECT MAX(l."createdAt") FROM "LoginLog" l WHERE l."userId" = u."id"),   TIMESTAMP 'epoch'),
          COALESCE( (SELECT MAX(p."createdAt") FROM "PointsLog" p WHERE p."userId" = u."id"),  TIMESTAMP 'epoch'),
          COALESCE( (SELECT MAX(g."createdAt") FROM "GamePointLog" g WHERE g."userId" = u."id"), TIMESTAMP 'epoch'),
          COALESCE( (SELECT MAX(v."createdAt") FROM "Visit" v WHERE v."userId" = u."id"),      TIMESTAMP 'epoch'),
          COALESCE( (SELECT MAX(w."createdAt") FROM "WheelSpinLog" w WHERE w."userId" = u."id"), TIMESTAMP 'epoch'),
          COALESCE(u."createdAt", TIMESTAMP 'epoch')
        )
        WHERE u.id > ${lastId} AND u.id <= ${batchEnd}`
      lastId = batchEnd
    }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${USER_TABLE_BULK_WRITE_LOCK_KEY}::bigint)`
  }
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

// `context` is a label identifying which job/role is being granted (e.g.
// 'syncCMoonDiscordRoles') purely so a failure can be traced back to its cause in
// CronErrorLog — a non-204/429 Discord response (wrong role snowflake, bot's role
// positioned below the target role, missing Manage Roles permission, etc.) used to be
// swallowed here with no trace at all, so a permanently-failing grant would silently
// retry and fail forever with no way for an admin to ever find out why.
async function addRoleToMember(discordUserId, roleId, context = 'addRoleToMember') {
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
    let bodyText = ''
    try { bodyText = await res.text() } catch {}
    const err = new Error(`Discord API ${res.status} granting role ${roleId} to user ${discordUserId}: ${bodyText}`)
    console.error(`[${context}]`, err.message)
    await logCronError(context, err)
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
  } catch (err) {
    await logCronError('syncVerifiedRoles', err)
    return
  }

  for (const row of rows) {
    const ok = await addRoleToMember(row.discordId, roleId, 'syncVerifiedRoles')
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
  } catch (err) {
    await logCronError('syncCMoonDiscordRoles', err)
    return
  }

  for (const row of rows) {
    const ok = await addRoleToMember(row.discordId, row.discordRoleId, 'syncCMoonDiscordRoles')
    if (!ok) continue
    try {
      await prisma.user.update({ where: { id: row.id }, data: { cMoonRoleGrantedAt: new Date() } })
    } catch {}
  }

  // cMoon RANK roles use the same add-only, snowflake-based, reconciliation-cron convention
  // as the base cMoon role above — deliberately not granted synchronously from
  // awardAchievementToUser, so there's exactly one place (this cron) that talks to Discord
  // for cMoon-related roles. Gated by cMoonRankRoleGrantedAt so a rank-up re-syncs even if
  // the user already has cMoonRoleGrantedAt set from joining their cMoon.
  let rankRows = []
  try {
    rankRows = await prisma.$queryRawUnsafe(`
      SELECT u."id", u."discordId", r."discordRoleId"
      FROM "User" u
      JOIN "CMoonRank" r ON r."id" = u."currentCMoonRankId"
      WHERE u."currentCMoonRankId" IS NOT NULL
        AND u."cMoonRankRoleGrantedAt" IS NULL
        AND r."discordRoleId" IS NOT NULL
        AND u."discordId" IS NOT NULL
        AND u."inGuild" = true
        AND u."active" = true
      LIMIT 300
    `)
  } catch (err) {
    await logCronError('syncCMoonRankDiscordRoles', err)
    return
  }

  for (const row of rankRows) {
    const ok = await addRoleToMember(row.discordId, row.discordRoleId, 'syncCMoonRankDiscordRoles')
    if (!ok) continue
    try {
      await prisma.user.update({ where: { id: row.id }, data: { cMoonRankRoleGrantedAt: new Date() } })
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
// Upper bound on one run's wall-clock time. The nickname-fix loop below is serial (one Discord
// PATCH per mismatched member, with 429 back-off), so at a few thousand members it can run for a
// very long time; the maintenance scheduler runs one job at a time, so an unbounded run would hold
// up everything queued behind it. Whatever is left is picked up on the next daily run — the
// mismatch check is recomputed from scratch each time.
const SYNC_GUILD_MAX_RUNTIME_MS = 30 * 60 * 1000

async function syncGuildMembers() {
  const deadline = Date.now() + SYNC_GUILD_MAX_RUNTIME_MS
  let truncated = false
  let nicknamesFixed = 0
  {
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
      if (Date.now() > deadline) { truncated = true; break }
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
      if (Date.now() > deadline) { truncated = true; break }
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
          nicknamesFixed++
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
  }
  return { nicknamesFixed, truncated }
}

// ─────────────────────────────────────────────────────────────────────────────

async function startDueAuctions() {
  let due
  try {
    const now = new Date()

    due = await prisma.auctionOnly.findMany({
      where: { isStarted: false, startsAt: { lte: now } },
      orderBy: { startsAt: 'asc' },
      include: AUCTION_ONLY_ROW_INCLUDE
    })
  } catch (e3) {
    console.error('[startDueAuctions] failed', e3)
    await logAuctionOnlyError('activation', e3, null)
    throw e3
  }

  let failed = 0
  for (const row of due) {
    try {
      await activateAuctionOnlyRow(row)
    } catch (e2) {
      failed++
      console.error('[startDueAuctions] failed to activate AuctionOnly', row.id, e2)
      await logAuctionOnlyError('activation', e2, row.id)
    }
  }
  // Per-row failures are already in AuctionOnlyErrorLog; surface the run as FAILED too so it
  // shows on the Cron Run Logs page instead of looking like a clean run.
  if (failed) throw new Error(`${failed} of ${due.length} AuctionOnly activation(s) failed — see AuctionOnly error log`)
  return due.length ? { activated: due.length } : undefined
}

async function sendDueAnnouncements() {
  let sent = 0
  let failedSends = 0
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
          failedSends++
          await prisma.announcement.update({
            where: { id: row.id },
            data: {
              sendingAt: null,
              sendError: 'Failed to send announcement to Discord.',
              sendErrorAt: new Date()
            }
          })
        } else {
          sent++
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
    throw e
  }
  if (failedSends) throw new Error(`${failedSends} announcement(s) failed to send to Discord (sent ${sent})`)
  return sent ? { sent } : undefined
}

// Pack go-live / go-off. With no packId this is the safety-net sweep that runs every few minutes;
// with a packId it is the exact-time delayed job (server/utils/queues.js schedulePackToggle,
// handled by the scheduled-events worker in the critical scheduler). Both re-check the DB, so a
// stale or duplicate delayed job is a harmless no-op.
//
// "On" = the go-live time has passed, it hasn't been put live yet (sentAt null) and it hasn't
// already ended. NOTE: this used to require scheduledOffAt = null, so a pack with BOTH a start and
// an end time was never put in cMart by the cron at all (the admin Packs page labelled it "Live"
// while the shop never listed it).
async function togglePacks(packId = null) {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const only = packId ? { id: packId } : {}
  const on = await prisma.pack.updateMany({
    where: {
      ...only,
      sentAt: null,
      scheduledAt: { lte: now },
      OR: [{ scheduledOffAt: null }, { scheduledOffAt: { gt: now } }]
    },
    data: { inCmart: true, sentAt: now }
  })
  const off = await prisma.pack.updateMany({
    where: {
      ...only,
      inCmart: true,
      // The sweep only looks back an hour so an admin who deliberately re-lists an ended pack
      // isn't undone forever; the exact-time job (packId) has no look-back limit.
      scheduledOffAt: packId ? { lte: now } : { gt: oneHourAgo, lte: now }
    },
    data: { inCmart: false }
  })
  return (on.count || off.count) ? { packsOn: on.count, packsOff: off.count } : undefined
}

async function markScheduledPacksInCmart() {
  return togglePacks()
}

// ─────────────────────────────────────────────────────────────────────────────
// Winball: set current grand prize from schedule (exact-time delayed job per row + 5-minute safety-net sweep)
async function updateWinballGrandPrizeFromSchedule() {
  {
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
  }
}

async function runTournamentCron() {
  await runTournamentScheduler(prisma)
}

// Sync Wordle daily crown results from Discord
async function syncWordleResultsDaily() {
  await syncWordleResults()
}

// Enqueue daily achievements processing (03:00 America/Chicago). One bulk, de-duplicated add
// (see enqueueAchievementChecks in server/utils/queues.js) instead of one awaited round trip per
// user; a user who already has a check waiting from the cMoon aggregate isn't queued twice.
async function enqueueAchievementsDaily() {
  const users = await prisma.user.findMany({ where: { active: true, banned: false }, select: { id: true } })
  await enqueueAchievementChecks(users.map(u => u.id))
  return { enqueued: users.length }
}

// Deletes old CronRunLog rows (see server/cron/runLogger.js). Lives here so it runs through the
// same maintenance scheduler as everything else.
async function pruneCronRunLogs() {
  return pruneCronLogs()
}

// job name -> handler. Names must match server/cron/jobs.js exactly (enforced by
// tests/cronJobsRegistry.test.js).
export const JOB_HANDLERS = {
  startDueAuctions,
  sendDueAnnouncements,
  markScheduledPacksInCmart,
  updateWinballGrandPrizeFromSchedule,
  runTournamentCron,
  recordDailyTaskCompletions: runRecordDailyTaskCompletions,
  cmoonDailyScoreCheck: checkAndRunCMoonDailyScoring,
  checkAndCreateWeeklyCZoneContest,
  checkAndPostWeeklyRiddle,
  checkAndPostWeeklyCMoonRecap,
  reconcileHolidayRedemptions,
  enqueueAchievementsDaily,
  runCMoonPointsAggregate,
  syncGuildMembers,
  recordDailyActivity,
  syncVerifiedRoles,
  syncCMoonDiscordRoles,
  sendInactivityWarnings,
  recomputeLastActivity,
  enforceDormantAccounts,
  syncWordleResultsDaily,
  runEconomyAggregate,
  runCzoneDisplayCountAggregate,
  pruneCronRunLogs,
}

// Handlers for the exact-time delayed jobs (server/utils/queues.js scheduledEventsQueue). Each one
// just re-runs the matching idempotent sweep, so a stale/duplicate job can't do harm.
export const SCHEDULED_EVENT_HANDLERS = {
  packOn: (data) => togglePacks(data?.packId ? String(data.packId) : null),
  packOff: (data) => togglePacks(data?.packId ? String(data.packId) : null),
  auctionOnlyStart: () => startDueAuctions(),
  announcementSend: () => sendDueAnnouncements(),
  winballPrizeUpdate: () => updateWinballGrandPrizeFromSchedule(),
}
