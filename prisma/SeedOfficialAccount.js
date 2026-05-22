// prisma/SeedOfficialAccount.js
// Bootstrap the configured "official" account. Idempotent per-step:
// re-running the script will skip whatever was already done and resume the rest.
//
// Usage: node prisma/SeedOfficialAccount.js
//
// Steps:
//   1. Create a User with the username from OFFICIAL_USERNAME
//      (defaults to CartoonReOrbitOfficial), flagged as admin + verified.
//   2. Grant one random active StarterSet (all items minted for free).
//   3. Set UserPoints to 1,000,000.
//   4. "Purchase" 10 random cMart cToons (mint + points deduction + purchase log).
//   5. Pick a random background from public/backgrounds/ and place 5 random
//      owned cToons onto a single zone of the user's cZone.

import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomInt } from 'node:crypto'
import { prisma } from '../server/prisma.js'

const OFFICIAL_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
const STARTING_POINTS = 1_000_000
const CMART_PURCHASE_COUNT = 10
const CZONE_TOON_COUNT = 5
const CZONE_PLACEMENT_WIDTH = 700
const CZONE_PLACEMENT_HEIGHT = 400

function pickRandom(arr) {
  return arr[randomInt(arr.length)]
}

function pickUnique(arr, n) {
  const pool = [...arr]
  const out = []
  while (out.length < n && pool.length) {
    out.push(pool.splice(randomInt(pool.length), 1)[0])
  }
  return out
}

async function ensureOfficialUser() {
  const existing = await prisma.user.findUnique({
    where: { username: OFFICIAL_USERNAME },
    select: { id: true, username: true }
  })
  if (existing) {
    console.log(`[1/5] User "${existing.username}" already exists (${existing.id}) — reusing`)
    return existing
  }
  const user = await prisma.user.create({
    data: {
      username: OFFICIAL_USERNAME,
      discordId: `seed-official-${OFFICIAL_USERNAME}`,
      isAdmin: true,
      isVerified: true,
      inGuild: true,
      active: true,
      lastLogin: new Date()
    },
    select: { id: true, username: true }
  })
  console.log(`[1/5] Created user "${user.username}" (${user.id})`)
  return user
}

// Atomic mint mirroring server/workers/mint.worker.js — without the queue,
// rate-limit, holiday-window, and time-based release machinery (this script
// runs against pre-filtered, currently-purchasable cToons).
async function mintCtoonForUser(userId, ctoon, { paid }) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.ctoon.update({
      where: { id: ctoon.id },
      data: { totalMinted: { increment: 1 } },
      select: { totalMinted: true, initialQuantity: true, quantity: true }
    })
    const mintNumber = updated.totalMinted
    if (updated.quantity !== null && mintNumber > updated.quantity) {
      throw new Error(`cToon "${ctoon.name}" sold out`)
    }
    const isFirstEdition =
      updated.initialQuantity === null || mintNumber <= updated.initialQuantity

    const uc = await tx.userCtoon.create({
      data: { userId, ctoonId: ctoon.id, mintNumber, isFirstEdition },
      select: { id: true, mintNumber: true }
    })

    await tx.ctoonOwnerLog.create({
      data: { userId, ctoonId: ctoon.id, userCtoonId: uc.id, mintNumber: uc.mintNumber }
    })

    if (paid) {
      const updatedPoints = await tx.userPoints.update({
        where: { userId },
        data: { points: { decrement: ctoon.price } }
      })
      await tx.pointsLog.create({
        data: {
          userId,
          points: ctoon.price,
          total: updatedPoints.points,
          method: 'Bought cToon',
          direction: 'decrease'
        }
      })
      await tx.cmartPurchaseLog.create({
        data: { userId, ctoonId: ctoon.id }
      })
    }
    return uc
  })
}

async function grantRandomStarterSet(userId) {
  // Idempotency: if the user already owns any UserCtoon at all, assume step 2
  // ran on a prior invocation (it's the first step that mints, and runs before
  // any cMart purchases).
  const existing = await prisma.userCtoon.count({ where: { userId } })
  if (existing > 0) {
    console.log(`[2/5] User already owns ${existing} cToon(s) — skipping starter set`)
    return
  }
  const sets = await prisma.starterSet.findMany({
    where: { isActive: true },
    include: { items: { include: { ctoon: true } } }
  })
  const eligible = sets.filter(s => s.items.length > 0)
  if (!eligible.length) {
    console.warn('[2/5] No active starter sets with items found; skipping')
    return
  }
  const set = pickRandom(eligible)
  console.log(`[2/5] Granting starter set "${set.name}" (${set.items.length} cToons)`)
  for (const item of set.items) {
    await mintCtoonForUser(userId, item.ctoon, { paid: false })
  }
}

async function setUserPoints(userId, points) {
  // Idempotency: if a UserPoints row already exists, leave the current balance
  // alone (don't overwrite the user's actual remaining points).
  const existing = await prisma.userPoints.findUnique({ where: { userId } })
  if (existing) {
    console.log(`[3/5] UserPoints already exists (${existing.points.toLocaleString()}pt) — skipping`)
    return
  }
  await prisma.userPoints.create({ data: { userId, points } })
  console.log(`[3/5] Set points to ${points.toLocaleString()}`)
}

async function purchaseCmartCtoons(userId) {
  // Idempotency: only buy as many as needed to reach CMART_PURCHASE_COUNT total.
  const alreadyPurchased = await prisma.cmartPurchaseLog.count({ where: { userId } })
  const remaining = CMART_PURCHASE_COUNT - alreadyPurchased
  if (remaining <= 0) {
    console.log(`[4/5] Already purchased ${alreadyPurchased} cMart cToon(s) — skipping`)
    return
  }
  if (alreadyPurchased > 0) {
    console.log(`[4/5] Already purchased ${alreadyPurchased}, will buy ${remaining} more`)
  }

  // Exclude ctoons the user already owns to avoid hitting per-user limits.
  const ownedCtoonIds = (await prisma.userCtoon.findMany({
    where: { userId },
    select: { ctoonId: true },
    distinct: ['ctoonId']
  })).map(r => r.ctoonId)

  const now = new Date()
  const candidates = await prisma.ctoon.findMany({
    where: {
      inCmart: true,
      codeOnly: false,
      releaseDate: { lte: now },
      holidayItems: { none: {} },
      id: { notIn: ownedCtoonIds }
    },
    select: {
      id: true, name: true, price: true,
      quantity: true, initialQuantity: true, totalMinted: true,
      perUserLimit: true
    }
  })
  const available = candidates.filter(c =>
    c.quantity === null || c.totalMinted < c.quantity
  )
  if (!available.length) {
    console.warn('[4/5] No eligible cMart cToons available; skipping')
    return
  }
  if (available.length < remaining) {
    console.warn(
      `[4/5] Only ${available.length} eligible cMart cToons available; ` +
      `will purchase as many as possible.`
    )
  }
  const picked = pickUnique(available, Math.min(remaining, available.length))
  console.log(`[4/5] Purchasing ${picked.length} cToons from cMart…`)
  for (const c of picked) {
    await mintCtoonForUser(userId, c, { paid: true })
    console.log(`        • ${c.name} (-${c.price}pt)`)
  }
}

function zoneHasToons(layoutData) {
  return (
    layoutData &&
    typeof layoutData === 'object' &&
    Array.isArray(layoutData.zones) &&
    layoutData.zones.some(z => Array.isArray(z.toons) && z.toons.length > 0)
  )
}

async function buildCzone(userId) {
  // Idempotency: if a CZone row already exists with any placed toons, skip.
  const existing = await prisma.cZone.findUnique({ where: { userId } })
  if (existing && zoneHasToons(existing.layoutData)) {
    console.log('[5/5] cZone already has placed toons — skipping')
    return
  }

  const backgroundsDir = path.join(process.cwd(), 'public', 'backgrounds')
  let backgrounds
  try {
    const files = await fs.readdir(backgroundsDir)
    backgrounds = files.filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))
  } catch (e) {
    console.warn(`[5/5] Could not read ${backgroundsDir}: ${e.message}; skipping cZone`)
    return
  }
  if (!backgrounds.length) {
    console.warn('[5/5] No background files found; skipping cZone')
    return
  }
  const chosenBackground = pickRandom(backgrounds)

  const owned = await prisma.userCtoon.findMany({
    where: { userId, burnedAt: null },
    include: { ctoon: true }
  })
  if (!owned.length) {
    console.warn('[5/5] User owns no cToons; skipping cZone placement')
    return
  }
  const placed = pickUnique(owned, Math.min(CZONE_TOON_COUNT, owned.length))

  const toons = placed.map(uc => ({
    id: uc.id,
    x: randomInt(CZONE_PLACEMENT_WIDTH),
    y: randomInt(CZONE_PLACEMENT_HEIGHT),
    mintNumber: uc.mintNumber,
    name: uc.ctoon.name,
    assetPath: uc.ctoon.assetPath,
    series: uc.ctoon.series,
    set: uc.ctoon.set,
    rarity: uc.ctoon.rarity,
    releaseDate: uc.ctoon.releaseDate,
    isGtoon: uc.ctoon.isGtoon,
    cost: uc.ctoon.cost,
    power: uc.ctoon.power,
    quantity: uc.ctoon.quantity,
    isFirstEdition: uc.isFirstEdition,
    characters: Array.isArray(uc.ctoon.characters) ? uc.ctoon.characters : []
  }))

  const config = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { czoneCount: true }
  })
  const totalZones = Math.max(1, Number(config?.czoneCount ?? 3))
  const zones = [{ background: chosenBackground, toons }]
  while (zones.length < totalZones) zones.push({ background: '', toons: [] })

  await prisma.cZone.upsert({
    where: { userId },
    update: { layoutData: { zones }, background: chosenBackground },
    create: { userId, layoutData: { zones }, background: chosenBackground }
  })
  console.log(
    `[5/5] Placed ${toons.length} cToons on cZone with background "${chosenBackground}"`
  )
}

async function main() {
  console.log(`Seeding official account "${OFFICIAL_USERNAME}"…`)
  const user = await ensureOfficialUser()
  await grantRandomStarterSet(user.id)
  await setUserPoints(user.id, STARTING_POINTS)
  await purchaseCmartCtoons(user.id)
  await buildCzone(user.id)
  console.log(`✅ Done seeding "${user.username}"`)
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => {})
