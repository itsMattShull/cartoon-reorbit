// server/scripts/mint-ctoon-to-user-list.js
// Usage: DATABASE_URL="postgres://..." node server/scripts/mint-ctoon-to-user-list.js

import { prisma } from '../server/prisma.js'
import { randomInt } from 'node:crypto'

/** Target cToon */
const CTOON_ID = '4b04eeb8-a7d8-4106-8996-5ea66b24f644'

/** Behavior flags */
const RESPECT_STOCK_LIMITS = true
const USER_PURCHASED_FLAG = false

/** Usernames to mint to */
const USERNAMES = [
  'MegaDragonSentinel',
  'CosmicDrifterDreamer',
  'ShadowNinjaAce',
  'AwesomeRocketRebel',
  'RockinVikingAdventurer',
  'AwesomeHackerAgent',
  'LegendaryGhostSuperstar',
  'ZenWarriorStrategist',
  'ChillNomadMystic',
  'PrismaticAngelQueen',
  'VelvetStormWarrior',
  'LegendaryWarriorGuru',
  'JollyDrifterGuardian',
  'SassyViperStargazer',
  'QuirkyDJSuperstar',
  'SuperSharkSlayer',
  'UmbraWizardSummoner',
  'CrystalSparkScholar',
  'BraveCheetahAthlete'
]

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

async function main() {
  console.log('🔎 Loading target cToon…')
  const ctoon = await prisma.ctoon.findUnique({
    where: { id: CTOON_ID },
    select: { id: true, name: true, initialQuantity: true, quantity: true },
  })
  if (!ctoon) throw new Error(`cToon not found: ${CTOON_ID}`)

  const startingCount = await prisma.userCtoon.count({ where: { ctoonId: CTOON_ID } })
  let mintedNow = 0

  const projectedTotal = () => startingCount + mintedNow
  const canMintMore = () => {
    if (!RESPECT_STOCK_LIMITS) return true
    if (ctoon.quantity == null) return true
    return projectedTotal() < ctoon.quantity
  }

  console.log('🔀 Shuffling usernames…')
  shuffleInPlace(USERNAMES)

  console.log(`🚀 Beginning mints for ${USERNAMES.length} users`)
  const missingUsers = []
  const alreadyOwned = []
  const mintedUsers = []
  const soldOutSkips = []

  for (const username of USERNAMES) {
    const user = await prisma.user.findFirst({
      where: { username },
      select: { id: true, username: true },
    })
    if (!user) {
      missingUsers.push(username)
      continue
    }

    // Skip if already owns the cToon
    const owns = await prisma.userCtoon.findFirst({
      where: { userId: user.id, ctoonId: CTOON_ID },
      select: { id: true },
    })
    if (owns) {
      alreadyOwned.push(username)
      continue
    }

    if (!canMintMore()) {
      soldOutSkips.push(username)
      continue
    }

    const nextMintNumber = projectedTotal() + 1
    const isFirstEdition =
      ctoon.initialQuantity == null ? true : nextMintNumber <= ctoon.initialQuantity

    await prisma.userCtoon.create({
      data: {
        userId: user.id,
        ctoonId: CTOON_ID,
        mintNumber: nextMintNumber,
        isFirstEdition,
        userPurchased: USER_PURCHASED_FLAG,
      },
    })

    mintedNow++
    mintedUsers.push(username)
    if (mintedNow % 25 === 0) {
      console.log(`…progress: ${mintedNow} minted so far`)
    }
  }

  console.log('✅ Done')
  console.log(`   cToon: "${ctoon.name ?? CTOON_ID}"`)
  console.log(`   Minted: ${mintedNow}`)
  console.log(`   Skipped (already owned): ${alreadyOwned.length} ${alreadyOwned.length ? '→ ' + alreadyOwned.join(', ') : ''}`)
  console.log(`   Skipped (missing users): ${missingUsers.length} ${missingUsers.length ? '→ ' + missingUsers.join(', ') : ''}`)
  if (RESPECT_STOCK_LIMITS) {
    console.log(`   Skipped (sold out): ${soldOutSkips.length} ${soldOutSkips.length ? '→ ' + soldOutSkips.join(', ') : ''}`)
  }
  console.log(`   Order used: ${mintedUsers.concat(alreadyOwned, missingUsers, soldOutSkips).join(' | ')}`)
}

main()
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
  .finally(async () => {})
