// server/scripts/add-starter-ctoones.js
// Usage:
//   DATABASE_URL="postgres://..." node server/scripts/add-starter-ctoones.js
//
// What it does:
//  - Ensures three specific cToons exist
//  - Adds them to a StarterSet so new users can choose them on account setup

import { prisma } from '../server/prisma.js'

const NEW_CTOONS = [
  {
    name: 'Cybersuit Dexter',
    series: 'Dexters Lab',
    type: 'image/gif',
    rarity: 'Very Rare',
    assetPath: '/cToons/Dexters Lab/cybersuit_dexter.gif',
    quantity: 100,
    perUserLimit: 1,
    inCmart: true,
    price: 700,
    set: 'Original',
  },
  {
    name: 'Charizard',
    series: 'Pokemon',
    type: 'image/gif',
    rarity: 'Very Rare',
    assetPath: '/cToons/Pokemon/charizard.gif',
    quantity: 100,
    perUserLimit: 1,
    inCmart: true,
    price: 800,
    set: 'Original',
  },
  {
    name: 'Goku',
    series: 'Dragon Ball Z',
    type: 'image/gif',
    rarity: 'Crazy Rare',
    assetPath: '/cToons/Dragon Ball Z/goku_standing_fm1.gif',
    quantity: 50,
    perUserLimit: 1,
    inCmart: true,
    price: 1200,
    set: 'Original',
  },
]

// Starter set metadata (used when wiring them into StarterSet/StarterSetItem)
const STARTER_SET_KEY = 'default-starter-set'
const STARTER_SET_NAME = 'Default Starter Set'
const STARTER_SET_DESCRIPTION =
  'Starter set with Cybersuit Dexter, Charizard, and Goku.'

async function ensureCtoons() {
  const createdOrExisting = []

  for (const config of NEW_CTOONS) {
    // Idempotent-ish: treat (name + assetPath) as our identity
    let ctoon = await prisma.ctoon.findFirst({
      where: {
        name: config.name,
        assetPath: config.assetPath,
      },
    })

    if (ctoon) {
      console.log(`✅ Found existing cToon "${config.name}" (${ctoon.id})`)
    } else {
      ctoon = await prisma.ctoon.create({
        data: {
          name: config.name,
          series: config.series,
          type: config.type,
          rarity: config.rarity,
          assetPath: config.assetPath,
          releaseDate: new Date(),
          perUserLimit: config.perUserLimit,
          codeOnly: false,
          inCmart: config.inCmart,
          price: config.price,
          initialQuantity: config.quantity,
          quantity: config.quantity,
          set: config.set,
          characters: [],
          // gToon defaults via schema
        },
      })
      console.log(`🎉 Created cToon "${config.name}" (${ctoon.id})`)
    }

    createdOrExisting.push(ctoon)
  }

  return createdOrExisting
}

async function ensureStarterSet(ctoons) {
  // 1) Ensure the StarterSet exists
  const starterSet = await prisma.starterSet.upsert({
    where: { key: STARTER_SET_KEY },
    update: {
      name: STARTER_SET_NAME,
      description: STARTER_SET_DESCRIPTION,
      isActive: true,
    },
    create: {
      key: STARTER_SET_KEY,
      name: STARTER_SET_NAME,
      description: STARTER_SET_DESCRIPTION,
      isActive: true,
      sortOrder: 0,
    },
  })

  console.log(`🧩 Using StarterSet "${starterSet.name}" (${starterSet.id})`)

  // 2) Ensure each cToon is included as a StarterSetItem
  for (let index = 0; index < ctoons.length; index++) {
    const ctoon = ctoons[index]
    const desiredPosition = index + 1

    const existingItem = await prisma.starterSetItem.findFirst({
      where: {
        setId: starterSet.id,
        ctoonId: ctoon.id,
      },
    })

    if (existingItem) {
      // Optionally normalize the position if it changed
      if (existingItem.position !== desiredPosition) {
        await prisma.starterSetItem.update({
          where: { id: existingItem.id },
          data: { position: desiredPosition },
        })
        console.log(
          `↔️  Updated position for "${ctoon.name}" in StarterSet to ${desiredPosition}`
        )
      } else {
        console.log(
          `✅ StarterSet already includes "${ctoon.name}" at position ${existingItem.position}`
        )
      }
    } else {
      const newItem = await prisma.starterSetItem.create({
        data: {
          setId: starterSet.id,
          ctoonId: ctoon.id,
          position: desiredPosition,
        },
      })
      console.log(
        `➕ Added "${ctoon.name}" to StarterSet at position ${newItem.position}`
      )
    }
  }
}

async function main() {
  const ctoons = await ensureCtoons()
  await ensureStarterSet(ctoons)
  console.log('✅ Finished seeding starter cToons and starter set items.')
}

main()
  .catch((err) => {
    console.error('❌ Error while seeding starter cToons:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
