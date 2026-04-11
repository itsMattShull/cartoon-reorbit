/**
 * seedDevUsers.js
 *
 * Generates 10 fake dev users, each with:
 *  - A random active starter set's cToons (minted directly)
 *  - A random public background for their cZone
 *  - Their cToons placed at random positions on their cZone canvas
 *
 * Run from the project root:
 *   node NewSite/admin-scripts/seedDevUsers.js
 *
 * Safe to re-run — skips users whose username already exists.
 */

import 'dotenv/config'
import { prisma } from '../../server/prisma.js'

// ── Config ────────────────────────────────────────────────────
const CANVAS_W   = 800
const CANVAS_H   = 600
const TOON_W     = 80    // default placed width  (px)
const TOON_H     = 80    // default placed height (px)

const FAKE_USERS = [
  { username: 'dexter_boy_genius',  discordId: 'fake_dev_0001' },
  { username: 'blossom_ppg',        discordId: 'fake_dev_0002' },
  { username: 'johnny_bravo_cool',  discordId: 'fake_dev_0003' },
  { username: 'ed_the_great',       discordId: 'fake_dev_0004' },
  { username: 'numbuh_1_operative', discordId: 'fake_dev_0005' },
  { username: 'raven_tt_dark',      discordId: 'fake_dev_0006' },
  { username: 'huckleberry_h',      discordId: 'fake_dev_0007' },
  { username: 'yogi_picnic_bear',   discordId: 'fake_dev_0008' },
  { username: 'scooby_snack_fan',   discordId: 'fake_dev_0009' },
  { username: 'top_cat_boss',       discordId: 'fake_dev_0010' },
]

// ── Helpers ───────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomPosition() {
  return {
    x: randInt(0, CANVAS_W - TOON_W),
    y: randInt(0, CANVAS_H - TOON_H),
  }
}

// Atomically increment totalMinted and return the new value
async function nextMintNumber(tx, ctoonId) {
  const updated = await tx.ctoon.update({
    where:  { id: ctoonId },
    data:   { totalMinted: { increment: 1 } },
    select: { totalMinted: true, initialQuantity: true },
  })
  return {
    mintNumber:    updated.totalMinted,
    isFirstEdition: updated.initialQuantity != null
      ? updated.totalMinted <= updated.initialQuantity
      : false,
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {

  // Load active starter sets (with their cToons)
  const starterSets = await prisma.starterSet.findMany({
    where:   { isActive: true },
    include: { items: { include: { ctoon: true } } },
  })
  if (!starterSets.length) {
    console.error('No active starter sets found. Run the seed first.')
    process.exit(1)
  }

  // Load public backgrounds
  const backgrounds = await prisma.background.findMany({
    where:  { visibility: 'PUBLIC' },
    select: { id: true, filename: true },
  })
  if (!backgrounds.length) {
    console.warn('No public backgrounds found — cZones will have no background.')
  }

  console.log(`Found ${starterSets.length} starter set(s), ${backgrounds.length} background(s).`)
  console.log('─'.repeat(60))

  for (const fake of FAKE_USERS) {
    // Skip if user already exists
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username: fake.username }, { discordId: fake.discordId }] },
      select: { id: true },
    })
    if (existing) {
      console.log(`⏭  Skipped  ${fake.username} (already exists)`)
      continue
    }

    // Pick a random starter set and background
    const chosenSet = randItem(starterSets)
    const chosenBg  = backgrounds.length ? randItem(backgrounds) : null

    // Create user + mint cToons + assign background + create cZone in one transaction
    const user = await prisma.$transaction(async (tx) => {

      // 1. Create the user
      const newUser = await tx.user.create({
        data: {
          discordId:  fake.discordId,
          discordTag: fake.username,
          username:   fake.username,
          active:     true,
        },
      })

      // 2. Mint each cToon in the chosen starter set
      const mintedToons = []
      for (const item of chosenSet.items) {
        const { mintNumber, isFirstEdition } = await nextMintNumber(tx, item.ctoon.id)
        const uc = await tx.userCtoon.create({
          data: {
            userId:        newUser.id,
            ctoonId:       item.ctoon.id,
            mintNumber,
            isFirstEdition,
            isTradeable:   true,
            userPurchased: false,
          },
          select: { id: true },
        })
        mintedToons.push({
          id:        uc.id,
          assetPath: item.ctoon.assetPath,
          name:      item.ctoon.name,
          width:     TOON_W,
          height:    TOON_H,
          ...randomPosition(),
        })
      }

      // 3. Assign chosen background to user (if any)
      if (chosenBg) {
        await tx.userBackground.create({
          data: { userId: newUser.id, backgroundId: chosenBg.id },
        })
      }

      // 4. Create cZone with random placements
      const config = await tx.globalGameConfig.findUnique({
        where:  { id: 'singleton' },
        select: { czoneCount: true },
      })
      const zoneCount = Math.max(1, Number(config?.czoneCount ?? 3))
      const zones = Array.from({ length: zoneCount }, (_, i) => ({
        background: i === 0 && chosenBg ? chosenBg.filename : '',
        toons: i === 0 ? mintedToons : [],
      }))

      await tx.cZone.create({
        data: {
          userId:     newUser.id,
          layoutData: { zones },
          background: chosenBg?.filename ?? '',
        },
      })

      return newUser
    })

    console.log(
      `✓  Created  ${user.username.padEnd(25)}` +
      `  set: "${chosenSet.name}"` +
      `  bg: ${chosenBg?.filename ?? 'none'}`
    )
  }

  console.log('─'.repeat(60))
  console.log('Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
