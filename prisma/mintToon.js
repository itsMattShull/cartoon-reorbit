// server/scripts/mint-ctoons-50-50.js
// Mint a cToon to every user with a 50/50 split between ctoonId "1" and "2".
// Usage: DATABASE_URL="postgres://..." node server/scripts/mint-ctoons-50-50.js

import { prisma } from '../server/prisma.js'
import { randomInt } from 'node:crypto'

/** EDIT HERE if your IDs differ */
const CTOON_A = 'a28e1213-05bc-4e62-9281-0a1444c07e84'
const CTOON_B = '5ee3d19d-b2f0-4105-8dcd-ace72acea98e'

/** Set to true if you want to *not* exceed Ctoon.quantity (when not null) */
const RESPECT_STOCK_LIMITS = true

/** Set whether these should count as a purchase */
const USER_PURCHASED_FLAG = false

async function main() {
  console.log('🔎 Loading users…')
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`👥 Found ${users.length} users`)

  console.log('🔎 Loading target cToons…')
  const targets = await prisma.ctoon.findMany({
    where: { id: { in: [CTOON_A, CTOON_B] } },
    select: { id: true, name: true, initialQuantity: true, quantity: true },
  })

  const info = Object.fromEntries(targets.map(t => [t.id, t]))
  if (!info[CTOON_A] || !info[CTOON_B]) {
    throw new Error(
      `Could not find both target cToons. Found: ${targets
        .map(t => t.id)
        .join(', ')}`
    )
  }

  // Current global minted counts for each target cToon (existing owners)
  const startingCountA = await prisma.userCtoon.count({ where: { ctoonId: CTOON_A } })
  const startingCountB = await prisma.userCtoon.count({ where: { ctoonId: CTOON_B } })

  // We'll advance these as we mint during this script
  const mintedNow = { [CTOON_A]: 0, [CTOON_B]: 0 }

  // Quick helpers
  const projectedTotal = (ctoonId) =>
    (ctoonId === CTOON_A ? startingCountA : startingCountB) + mintedNow[ctoonId]

  const canMintMore = (ctoonId) => {
    const stock = info[ctoonId].quantity // null = unlimited
    if (!RESPECT_STOCK_LIMITS || stock == null) return true
    return projectedTotal(ctoonId) < stock
  }

  let minted = 0
  let skippedAlreadyOwnedBoth = 0
  let skippedSoldOut = 0

  console.log('🚀 Beginning mints…')
  for (const u of users) {
    // Which of the two does the user already own?
    const already = await prisma.userCtoon.findMany({
      where: { userId: u.id, ctoonId: { in: [CTOON_A, CTOON_B] } },
      select: { ctoonId: true },
      distinct: ['ctoonId'],
    })
    const owned = new Set(already.map(a => a.ctoonId))

    if (owned.has(CTOON_A) && owned.has(CTOON_B)) {
      skippedAlreadyOwnedBoth++
      continue
    }

    // 50/50 pick
    let chosen = randomInt(2) === 0 ? CTOON_A : CTOON_B
    // If they already own the chosen one, give them the other (if possible)
    if (owned.has(chosen)) {
      chosen = chosen === CTOON_A ? CTOON_B : CTOON_A
    }

    // Respect stock limits if requested
    if (!canMintMore(chosen)) {
      // Try the other one if possible
      const other = chosen === CTOON_A ? CTOON_B : CTOON_A
      if (!owned.has(other) && canMintMore(other)) {
        chosen = other
      } else {
        skippedSoldOut++
        continue
      }
    }

    // Compute next mint number *for that cToon* as if appended to the end
    const nextMintNumber = projectedTotal(chosen) + 1
    const initialQty = info[chosen].initialQuantity // null ⇒ all first edition
    const isFirstEdition =
      initialQty == null ? true : nextMintNumber <= initialQty

    // Create the UserCtoon entry
    await prisma.userCtoon.create({
      data: {
        userId: u.id,
        ctoonId: chosen,
        mintNumber: nextMintNumber,
        isFirstEdition,
        userPurchased: USER_PURCHASED_FLAG,
      },
    })

    mintedNow[chosen]++
    minted++
    if (minted % 50 === 0) {
      console.log(
        `…progress: minted ${minted} so far (A: +${mintedNow[CTOON_A]}, B: +${mintedNow[CTOON_B]})`
      )
    }
  }

  console.log('✅ Done!')
  console.log(`   Minted total: ${minted}`)
  console.log(
    `   By cToon: "${info[CTOON_A].name ?? CTOON_A}" +${mintedNow[CTOON_A]}, ` +
    `"${info[CTOON_B].name ?? CTOON_B}" +${mintedNow[CTOON_B]}`
  )
  if (skippedAlreadyOwnedBoth) {
    console.log(`   Skipped (already owned both): ${skippedAlreadyOwnedBoth}`)
  }
  if (RESPECT_STOCK_LIMITS && skippedSoldOut) {
    console.log(`   Skipped (sold out): ${skippedSoldOut}`)
  }
}

main()
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
