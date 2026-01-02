// server/scripts/mint-ctoon-to-user-list.js
// Usage: DATABASE_URL="postgres://..." node prisma/contestMint.js [--mint] [--totals]

import { prisma } from '../server/prisma.js'
import { randomInt } from 'node:crypto'

/** Target cToon */
const CTOON_ID = '41f8f882-58b6-4de5-b69b-45f0c143d320'

/** Behavior flags */
const RESPECT_STOCK_LIMITS = true
const USER_PURCHASED_FLAG = false

/** Usernames to mint to */
const USERNAMES = [
  'DoodleToonStargazer',
  'RockinVikingAdventurer',
  'ChillZebraWarrior',
  'BraveBeastChampion',
  'TurboPixelPilot',
  'HyperTitanAlchemist',
  'QuirkyDJSuperstar',
  'RetroWarriorPilot',
  'LegendaryWarriorGuru',
  'AwesomeHackerAgent',
  'ObsidianZombieMystic',
  'SassyViperStargazer',
  'CosmicDrifterDreamer',
  'MightyBeastScholar',
  'CrystalSparkScholar',
  'CyberLionOverlord',
  'GalaxyChargerPilot',
  'RetroSkaterJuggernaut',
  'BraveCheetahAthlete',
  'JollyDrifterGuardian',
  'ChillNomadMystic',
  'MysticAlienVoyager',
  'LegendaryGhostSuperstar',
  'ShadowNinjaAce',
  'GrimBravoCourage',
  'SneakyAlienCommander'
]

const ARGS = new Set(process.argv.slice(2))
const DO_MINT = ARGS.has('--mint')
const DO_TOTALS = ARGS.has('--totals')
const DRY_RUN = !DO_MINT && !DO_TOTALS

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

async function main() {
  if (DRY_RUN) {
    console.log('ℹ️ Dry run: no changes will be made. Use --mint and/or --totals to apply.')
  }
  console.log('🔎 Loading target cToon…')
  const ctoon = await prisma.ctoon.findUnique({
    where: { id: CTOON_ID },
    select: { id: true, name: true, initialQuantity: true, quantity: true },
  })
  if (!ctoon) throw new Error(`cToon not found: ${CTOON_ID}`)

  const startingCount = await prisma.userCtoon.count({ where: { ctoonId: CTOON_ID } })
  let mintedNow = 0
  const shouldProcessMints = DO_MINT || DRY_RUN

  const projectedTotal = () => startingCount + mintedNow
  const canMintMore = () => {
    if (!RESPECT_STOCK_LIMITS) return true
    if (ctoon.quantity == null) return true
    return projectedTotal() < ctoon.quantity
  }

  const missingUsers = []
  const alreadyOwned = []
  const mintedUsers = []
  const soldOutSkips = []

  if (shouldProcessMints) {
    console.log('🔀 Shuffling usernames…')
    shuffleInPlace(USERNAMES)

    console.log(`🚀 ${DO_MINT ? 'Beginning mints' : 'Evaluating mints'} for ${USERNAMES.length} users`)
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

      if (DO_MINT) {
        await prisma.userCtoon.create({
          data: {
            userId: user.id,
            ctoonId: CTOON_ID,
            mintNumber: nextMintNumber,
            isFirstEdition,
            userPurchased: USER_PURCHASED_FLAG,
          },
        })
      }

      mintedNow++
      mintedUsers.push(username)
      if (DO_MINT && mintedNow % 25 === 0) {
        console.log(`…progress: ${mintedNow} minted so far`)
      }
    }
  } else {
    console.log('ℹ️ Minting skipped (use --mint to enable).')
  }

  let finalCount = null
  if (DO_TOTALS) {
    finalCount = await prisma.userCtoon.count({ where: { ctoonId: CTOON_ID } })
    await prisma.ctoon.update({
      where: { id: CTOON_ID },
      data: { totalMinted: finalCount }
    })
  } else if (DRY_RUN) {
    finalCount = projectedTotal()
  }

  console.log('✅ Done')
  console.log(`   cToon: "${ctoon.name ?? CTOON_ID}"`)
  if (shouldProcessMints) {
    console.log(`   Minted: ${mintedNow}${DO_MINT ? '' : ' (dry run)'}`)
    console.log(`   Skipped (already owned): ${alreadyOwned.length} ${alreadyOwned.length ? '→ ' + alreadyOwned.join(', ') : ''}`)
    console.log(`   Skipped (missing users): ${missingUsers.length} ${missingUsers.length ? '→ ' + missingUsers.join(', ') : ''}`)
    if (RESPECT_STOCK_LIMITS) {
      console.log(`   Skipped (sold out): ${soldOutSkips.length} ${soldOutSkips.length ? '→ ' + soldOutSkips.join(', ') : ''}`)
    }
    console.log(`   Order used: ${mintedUsers.concat(alreadyOwned, missingUsers, soldOutSkips).join(' | ')}`)
  }
  if (DO_TOTALS) {
    console.log(`   Total minted (updated): ${finalCount}`)
  } else if (DRY_RUN) {
    console.log(`   Total minted (would update): ${finalCount}`)
  }
}

main()
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
  .finally(async () => {})
