// prisma/seedTestUsers.js
//
// Dev-only seed: creates N test users (default 30) that look like players who went through the
// real onboarding flow. For each user:
//   1. a random username built from the setup-username word lists (same three-part pattern
//      /api/auth/set-username enforces), and a random free avatar from public/avatars
//   2. a random active starter set, minted through processMintJob (method STARTER_SET), exactly
//      what POST /api/starter-sets queues
//   3. STARTING_POINTS points, then 5 random cMart cToons bought through processMintJob, so
//      prices, mint numbers, quantity/per-user limits and points logs all follow the real rules
//   4. a random PUBLIC background, and 5 random cToons from their collection placed at random
//      positions on cZone 0, stored in the same enriched layout /api/czone/save writes
//
// Test users are tagged with discordId "seedtest-<uuid>" and inGuild=true so they're easy to find.
// Not idempotent: each run adds N more users.
//
// Usage:
//   node prisma/seedTestUsers.js            # 30 users
//   node prisma/seedTestUsers.js --count 5

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Redis from 'ioredis'
import { prisma } from '../server/prisma.js'
import { processMintJob } from '../server/utils/mintCtoon.js'
import { OG_GTOON_DISPLAY_SELECT, ogGtoonDisplay } from '../server/utils/ogGtoonDisplay.js'

const argCount = process.argv.indexOf('--count')
const COUNT = argCount > -1 ? Math.max(1, parseInt(process.argv[argCount + 1], 10) || 30) : 30
const STARTING_POINTS = 5000
const CMART_BUYS = 5
const CZONE_TOONS = 5
const CANVAS_W = 800 // MyCzone.vue design-space canvas
const CANVAS_H = 600
const TOON_MARGIN = 120 // keep placed toons (~100px images) inside the canvas
const NAV_CACHE_KEY = 'czone:nav:usernames' // server/api/czone/[username]/next.get.js

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const shuffle = (arr) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

// Same word lists the setup page offers (read from the page so they can't drift apart).
function loadWordLists () {
  const src = fs.readFileSync(path.resolve('pages/setup-username.vue'), 'utf8')
  const block = src.match(/const wordLists = \[([\s\S]*?)\n\]/)
  if (!block) throw new Error('Could not find wordLists in pages/setup-username.vue')
  const lists = [...block[1].matchAll(/\[([\s\S]*?)\]/g)].map(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))
  if (lists.length !== 3 || lists.some(l => !l.length)) throw new Error('Unexpected wordLists shape in setup-username.vue')
  return lists
}

async function uniqueUsername (wordLists, taken) {
  for (let i = 0; i < 200; i++) {
    const name = wordLists.map(pick).join('')
    if (taken.has(name)) continue
    if (await prisma.user.findFirst({ where: { username: name }, select: { id: true } })) { taken.add(name); continue }
    taken.add(name)
    return name
  }
  throw new Error('Could not find a free username after 200 tries')
}

// Free avatars = files in public/avatars that aren't gated in the Avatar table (GET /api/avatars).
async function freeAvatars () {
  const files = fs.readdirSync(path.resolve('public/avatars')).filter(f => /\.(png|jpe?g|gif)$/i.test(f))
  const restricted = new Set((await prisma.avatar.findMany({ select: { filename: true } })).map(a => a.filename))
  return files.filter(f => !restricted.has(f))
}

async function mint (userId, ctoonId, extra) {
  await processMintJob({ data: { userId, ctoonId, ...extra } }, prisma)
}

async function main () {
  const wordLists = loadWordLists()
  const avatars = await freeAvatars()
  const starterSets = await prisma.starterSet.findMany({
    where: { isActive: true },
    include: { items: { orderBy: { position: 'asc' }, select: { ctoonId: true } } }
  })
  const backgrounds = await prisma.background.findMany({ where: { visibility: 'PUBLIC' }, select: { imagePath: true } })
  const cfg = await prisma.globalGameConfig.findFirst({ select: { czoneCount: true } })
  const zoneCount = Math.max(1, Number(cfg?.czoneCount ?? 3))

  if (!avatars.length) throw new Error('No free avatars in public/avatars')
  if (!starterSets.length) throw new Error('No active starter sets')
  console.log(`Seeding ${COUNT} test users (avatars: ${avatars.length}, starter sets: ${starterSets.length}, backgrounds: ${backgrounds.length})`)

  const taken = new Set()
  const summary = { users: 0, starterMints: 0, cmartBuys: 0, cmartFailures: 0, placed: 0 }

  for (let n = 0; n < COUNT; n++) {
    const username = await uniqueUsername(wordLists, taken)
    const user = await prisma.user.create({
      data: {
        discordId: `seedtest-${crypto.randomUUID()}`,
        discordUsername: username.toLowerCase(),
        username,
        usernameChangedAt: new Date(),
        avatar: pick(avatars),
        active: true,
        inGuild: true,
        lastLogin: new Date()
      }
    })
    await prisma.userPoints.create({ data: { userId: user.id, points: STARTING_POINTS } })

    // Starter set (special mint: no charge, no cMart limits)
    const set = pick(starterSets)
    for (const item of set.items) {
      try { await mint(user.id, item.ctoonId, { isSpecial: true, method: 'STARTER_SET' }); summary.starterMints++ } catch (e) {
        console.warn(`  ${username}: starter mint failed (${e.message})`)
      }
    }

    // 5 random cMart purchases; re-roll on any rule rejection (sold out, limit, points...)
    const now = new Date()
    const pool = shuffle(await prisma.ctoon.findMany({
      where: { inCmart: true, codeOnly: false, releaseDate: { lte: now }, price: { gt: 0 } },
      select: { id: true, price: true }
    }))
    let bought = 0
    for (const c of pool) {
      if (bought >= CMART_BUYS) break
      try { await mint(user.id, c.id, { effectivePrice: c.price }); bought++; summary.cmartBuys++ } catch { summary.cmartFailures++ }
    }
    if (bought < CMART_BUYS) console.warn(`  ${username}: only bought ${bought}/${CMART_BUYS} cMart cToons`)

    // cZone: random public background + 5 random owned cToons on zone 0
    const owned = await prisma.userCtoon.findMany({
      where: { userId: user.id, burnedAt: null },
      select: {
        id: true, mintNumber: true, isFirstEdition: true,
        ctoon: { select: {
          name: true, assetPath: true, ...OG_GTOON_DISPLAY_SELECT, series: true, set: true, rarity: true,
          releaseDate: true, isGtoon: true, cost: true, power: true, quantity: true, characters: true
        } }
      }
    })
    const toons = shuffle(owned).slice(0, CZONE_TOONS).map(uc => ({
      id: uc.id,
      x: randInt(0, CANVAS_W - TOON_MARGIN),
      y: randInt(0, CANVAS_H - TOON_MARGIN),
      mintNumber: uc.mintNumber,
      name: uc.ctoon.name,
      assetPath: uc.ctoon.assetPath,
      ...ogGtoonDisplay(uc.ctoon),
      series: uc.ctoon.series,
      set: uc.ctoon.set,
      rarity: uc.ctoon.rarity,
      releaseDate: uc.ctoon.releaseDate,
      isGtoon: uc.ctoon.isGtoon,
      cost: uc.ctoon.cost,
      power: uc.ctoon.power,
      quantity: uc.ctoon.quantity,
      isFirstEdition: uc.isFirstEdition,
      characters: uc.ctoon.characters
    }))
    const background = backgrounds.length ? pick(backgrounds).imagePath : ''
    const zones = [{ background, toons }]
    while (zones.length < zoneCount) zones.push({ background: '', toons: [] })
    await prisma.cZone.upsert({
      where: { userId: user.id },
      update: { layoutData: { zones }, background },
      create: { userId: user.id, layoutData: { zones }, background }
    })
    summary.placed += toons.length
    summary.users++

    const pts = await prisma.userPoints.findUnique({ where: { userId: user.id }, select: { points: true } })
    console.log(`${String(n + 1).padStart(2)}. ${username.padEnd(34)} set="${set.name}" owned=${owned.length} placed=${toons.length} points=${pts?.points}`)
  }

  // New cZones should show up in next/previous cZone navigation right away.
  const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined, lazyConnect: true })
  try { await redis.connect(); await redis.del(NAV_CACHE_KEY) } catch (e) { console.warn(`Could not clear cZone nav cache (${e.message})`) } finally { redis.disconnect() }

  console.log('\nDone:', summary)
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
