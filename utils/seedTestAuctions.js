// utils/seedTestAuctions.js
//
// Dev-only: generates market activity for the seeded test users (discordId "seedtest-…",
// see utils/seedTestUsers.js), in creation order:
//   1. +5000 points each (UserPoints increment + a PointsLog "increase" row)
//   2. 5 random cMart cToons each, bought through processMintJob (real prices, limits, logs)
//   3. 1 auction each, created by the REAL POST /api/auctions handler. Duration is random from
//      the AuctionDurationPicker presets, except user #1 = 15 min and user #2 = 30 min.
//      Starting bid = the rarity floor (the minimum the handler accepts).
//   4. 1 auto-bid each, set by the REAL POST /api/auction/:id/autobid handler on a random
//      active auction they didn't create, with maxAmount = 2x that cToon's cMart price.
//
// The handlers run in a local h3 server (same approach as tests/helpers/dbKit.js) with every
// Discord token/webhook env var removed first, so nothing is posted to Discord. Auction-close
// jobs go on the real BullMQ queue, so the running dev server closes them on time, and
// auto-bid "new-bid" events are bridged to the running socket server so open pages update.
//
// Usage: node utils/seedTestAuctions.js [--from-step N]
//   --from-step resumes a partial run (e.g. 3 = skip points and cMart buys). Step 3 skips any
//   user who already has an ACTIVE auction, re-scheduling its close job instead.
//
// Needs Redis running (auction-close jobs); the script checks before touching anything.

import 'dotenv/config'
import http from 'node:http'
import { register } from 'node:module'

for (const k of Object.keys(process.env)) {
  if (/DISCORD|BOT_TOKEN|WEBHOOK/i.test(k)) delete process.env[k]
}

// Nuxt-only module specifiers: `@/` (tests' alias loader) and `#imports` (runtime config stub).
register('../tests/helpers/aliasLoader.mjs', import.meta.url)
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { return s === '#imports' ? { url: 'data:text/javascript,export const useRuntimeConfig = () => globalThis.__runtimeConfig', shortCircuit: true } : n(s, c) }"
))
globalThis.__runtimeConfig = {
  socketOrigin: process.env.SOCKET_ORIGIN || 'http://localhost:3001',
  socketPath: process.env.SOCKET_PATH || '/socket.io',
  socketBridgeSecret: process.env.SOCKET_BRIDGE_SECRET || process.env.JWT_SECRET,
  public: { baseUrl: process.env.BASE_URL || '', socketPort: process.env.SOCKET_PORT || 3001 }
}
globalThis.useRuntimeConfig = () => globalThis.__runtimeConfig

const { createApp, createRouter, toNodeListener, defineEventHandler } = await import('h3')
const { prisma } = await import('../server/prisma.js')
const { processMintJob } = await import('../server/utils/mintCtoon.js')
const { rarityFloor } = await import('../server/utils/auctionPriceSuggestion.js')
const { auctionCloseQueue, mintQueue, scheduleAuctionClose } = await import('../server/utils/queues.js')
const createAuction = (await import('../server/api/auctions.post.js')).default
const setAutoBid = (await import('../server/api/auction/[id]/autobid.post.js')).default

const POINTS_GRANT = 5000
const CMART_BUYS = 5
// AuctionDurationPicker presets (3m … 12h) plus its "Days…" option (1–7 days)
const DURATIONS = [3, 30, 60, 240, 360, 720, 1440, 2880, 4320, 5760, 7200, 8640, 10080]
const FIXED_DURATIONS = [15, 30] // user #1, user #2

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const shuffle = (arr) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const fmtMins = (m) => (m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`)

// Handlers authenticate via $fetch('/api/auth/me', { cookie }); here the cookie is `seedUser=<id>`.
globalThis.$fetch = async (url, opts = {}) => {
  if (url !== '/api/auth/me') throw new Error(`unexpected $fetch: ${url}`)
  const id = /seedUser=([^;]+)/.exec(opts.headers?.cookie || '')?.[1]
  const me = id && await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, discordId: true, isAdmin: true } })
  if (!me) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  return me
}

async function startApi () {
  const router = createRouter()
  router.post('/api/auctions', createAuction)
  router.post('/api/auction/:id/autobid', setAutoBid)
  const app = createApp().use(defineEventHandler((event) => {
    event.context.userId = /seedUser=([^;]+)/.exec(event.node.req.headers.cookie || '')?.[1] || null
  }))
  const server = http.createServer(toNodeListener(app.use(router)))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    async post (path, userId, body) {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: { cookie: `seedUser=${userId}`, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      const text = await res.text()
      let parsed; try { parsed = JSON.parse(text) } catch { parsed = text }
      return { status: res.status, body: parsed }
    },
    close: () => new Promise(resolve => server.close(resolve))
  }
}

const errMsg = (r) => r.body?.statusMessage || r.body?.message || JSON.stringify(r.body)

async function main () {
  const users = await prisma.user.findMany({
    where: { discordId: { startsWith: 'seedtest-' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, username: true }
  })
  if (!users.length) throw new Error('No seeded test users found (run utils/seedTestUsers.js first)')
  // BullMQ waits forever for a missing Redis, which would hang the auction handler mid-request.
  await Promise.race([
    auctionCloseQueue.getJobCounts(),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`Redis not reachable at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`)), 5000))
  ])
  const fromIdx = process.argv.indexOf('--from-step')
  const FROM_STEP = fromIdx > -1 ? Number(process.argv[fromIdx + 1]) || 1 : 1
  console.log(`${users.length} seeded test users${FROM_STEP > 1 ? `, starting at step ${FROM_STEP}` : ''}\n`)
  const api = await startApi()
  const summary = { points: 0, cmartBuys: 0, auctions: 0, autoBids: 0 }

  // 1. +5000 points
  if (FROM_STEP <= 1) console.log('— 1. Points')
  for (const u of FROM_STEP <= 1 ? users : []) {
    await prisma.$transaction(async (tx) => {
      const up = await tx.userPoints.upsert({
        where: { userId: u.id },
        update: { points: { increment: POINTS_GRANT } },
        create: { userId: u.id, points: POINTS_GRANT }
      })
      await tx.pointsLog.create({ data: { userId: u.id, direction: 'increase', points: POINTS_GRANT, total: up.points, method: 'Admin Grant (test seed)' } })
    })
    summary.points++
  }
  if (FROM_STEP <= 1) console.log(`  granted ${POINTS_GRANT} to ${summary.points} users`)

  // 2. 5 random cMart buys; re-roll on any rule rejection (sold out, per-user limit, points…)
  if (FROM_STEP <= 2) console.log('— 2. cMart buys')
  for (const u of FROM_STEP <= 2 ? users : []) {
    const pool = shuffle(await prisma.ctoon.findMany({
      where: { inCmart: true, codeOnly: false, releaseDate: { lte: new Date() }, price: { gt: 0 } },
      select: { id: true, name: true, price: true }
    }))
    const bought = []
    for (const c of pool) {
      if (bought.length >= CMART_BUYS) break
      try { await processMintJob({ data: { userId: u.id, ctoonId: c.id, effectivePrice: c.price } }, prisma); bought.push(`${c.name} (${c.price})`) } catch {}
    }
    summary.cmartBuys += bought.length
    console.log(`  ${u.username.padEnd(34)} ${bought.length}/${CMART_BUYS}: ${bought.join(', ')}`)
  }

  // 3. One auction each. Prefer a copy whose 2x cMart price clears its starting bid, so the
  //    auto-bids in step 4 can actually bid on it.
  console.log('— 3. Auctions')
  for (const [i, u] of (FROM_STEP <= 3 ? users : []).entries()) {
    const existing = await prisma.auction.findFirst({
      where: { creatorId: u.id, status: 'ACTIVE' },
      select: { id: true, endAt: true, durationMinutes: true, userCtoon: { select: { ctoon: { select: { name: true } } } } }
    })
    if (existing) {
      await scheduleAuctionClose(existing.id, existing.endAt)
      summary.auctions++
      console.log(`  ${String(i + 1).padStart(2)}. ${u.username.padEnd(34)} ${fmtMins(existing.durationMinutes).padStart(4)}  ${existing.userCtoon.ctoon.name} (already listed; close job scheduled for ${existing.endAt.toISOString()})`)
      continue
    }
    const minutes = FIXED_DURATIONS[i] ?? pick(DURATIONS)
    const owned = await prisma.userCtoon.findMany({
      where: {
        userId: u.id, burnedAt: null, lockedByUserId: null,
        auctions: { none: { status: 'ACTIVE' } },
        tradeOfferCtoons: { none: { tradeOffer: { status: 'PENDING' } } }
      },
      select: { id: true, mintNumber: true, ctoon: { select: { name: true, rarity: true, price: true } } }
    })
    const viable = owned.filter(uc => (uc.ctoon.price || 0) * 2 > rarityFloor(uc.ctoon.rarity))
    let made = null
    for (const uc of [...shuffle(viable), ...shuffle(owned.filter(o => !viable.includes(o)))]) {
      const bet = rarityFloor(uc.ctoon.rarity)
      const r = await api.post('/api/auctions', u.id, { userCtoonId: uc.id, initialBet: bet, durationDays: 0, durationMinutes: minutes })
      if (r.status === 200) { made = { uc, bet }; break }
      console.warn(`    ${u.username}: ${uc.ctoon.name} rejected (${r.status} ${errMsg(r)}), trying another`)
    }
    if (!made) { console.warn(`  ${u.username}: could not create an auction`); continue }
    summary.auctions++
    console.log(`  ${String(i + 1).padStart(2)}. ${u.username.padEnd(34)} ${fmtMins(minutes).padStart(4)}  ${made.uc.ctoon.name} #${made.uc.mintNumber} (${made.uc.ctoon.rarity}, start ${made.bet}, cMart ${made.uc.ctoon.price})`)
  }

  // 4. One auto-bid each on a random active auction they didn't create, max = 2x cMart price.
  //    Re-roll on rejection (duplicate max on that auction, featured rules, points).
  console.log('— 4. Auto-bids')
  for (const u of users) {
    const auctions = await prisma.auction.findMany({
      where: { status: 'ACTIVE', endAt: { gt: new Date() }, NOT: { creatorId: u.id } },
      select: { id: true, initialBet: true, userCtoon: { select: { ctoon: { select: { name: true, price: true } } } } }
    })
    const candidates = auctions.filter(a => (a.userCtoon?.ctoon?.price || 0) > 0)
    const viable = candidates.filter(a => a.userCtoon.ctoon.price * 2 >= a.initialBet)
    let placed = null
    for (const a of [...shuffle(viable), ...shuffle(candidates.filter(c => !viable.includes(c)))]) {
      const max = a.userCtoon.ctoon.price * 2
      const r = await api.post(`/api/auction/${a.id}/autobid`, u.id, { maxAmount: max })
      if (r.status === 200) { placed = { a, max, r: r.body }; break }
      console.warn(`    ${u.username}: auction ${a.id.slice(0, 8)} rejected (${r.status} ${errMsg(r)}), trying another`)
    }
    if (!placed) { console.warn(`  ${u.username}: could not place an auto-bid`); continue }
    summary.autoBids++
    console.log(`  ${u.username.padEnd(34)} max ${String(placed.max).padStart(5)} on ${placed.a.userCtoon.ctoon.name} (auction ${placed.a.id.slice(0, 8)}) → high bid now ${placed.r.highestBid ?? '—'}`)
  }

  await api.close()
  console.log('\nDone:', summary)
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exitCode = 1 })
  .finally(async () => {
    await prisma.$disconnect()
    await Promise.allSettled([auctionCloseQueue.close(), mintQueue.close()])
    setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref()
  })
