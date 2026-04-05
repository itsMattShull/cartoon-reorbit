// prisma/repair-czone-images.js
// Repairs cZone layoutData records where assetPaths were saved as April Fools
// swapped values instead of the real ctoon assetPath.
//
// Uses rawPrisma (unextended client) so this script is safe to run on any day,
// including April 1st, and will always read/write the real assetPaths.
//
// Usage:
//   node prisma/repair-czone-images.js            # dry run (default)
//   node prisma/repair-czone-images.js --apply    # actually update the DB

import { rawPrisma as prisma } from '../server/prisma.js'

const dryRun = !process.argv.includes('--apply')

if (dryRun) {
  console.log('[repair-czone-images] DRY RUN — pass --apply to write changes')
}

async function main() {
  // 1. Load all cZones that have layoutData with zones
  const czones = await prisma.cZone.findMany({
    select: { id: true, userId: true, layoutData: true }
  })

  console.log(`[repair-czone-images] Checking ${czones.length} cZone records...`)

  // 2. Collect all userCtoon IDs referenced across all cZone layouts
  const allUserCtoonIds = new Set()
  for (const czone of czones) {
    const zones = czone.layoutData?.zones
    if (!Array.isArray(zones)) continue
    for (const zone of zones) {
      if (!Array.isArray(zone.toons)) continue
      for (const toon of zone.toons) {
        if (typeof toon.id === 'string') allUserCtoonIds.add(toon.id)
      }
    }
  }

  if (allUserCtoonIds.size === 0) {
    console.log('[repair-czone-images] No toons found in any cZone layout. Nothing to do.')
    return
  }

  // 3. Fetch real assetPaths for all referenced userCtoons
  const userCtoons = await prisma.userCtoon.findMany({
    where: { id: { in: Array.from(allUserCtoonIds) } },
    select: { id: true, ctoon: { select: { assetPath: true } } }
  })

  const realAssetPath = new Map(
    userCtoons.map((uc) => [uc.id, uc.ctoon.assetPath])
  )

  // 4. Check each cZone and build repairs
  let checkedCount = 0
  let repairedCount = 0

  for (const czone of czones) {
    checkedCount++
    const zones = czone.layoutData?.zones
    if (!Array.isArray(zones)) continue

    let needsUpdate = false
    const fixedZones = zones.map((zone) => {
      if (!Array.isArray(zone.toons)) return zone
      const fixedToons = zone.toons.map((toon) => {
        if (typeof toon.id !== 'string') return toon
        const real = realAssetPath.get(toon.id)
        if (!real || real === toon.assetPath) return toon
        needsUpdate = true
        return { ...toon, assetPath: real }
      })
      return { ...zone, toons: fixedToons }
    })

    if (!needsUpdate) continue

    repairedCount++
    console.log(`[repair-czone-images] ${dryRun ? '[DRY RUN] Would repair' : 'Repairing'} cZone ${czone.id} (userId: ${czone.userId})`)

    if (!dryRun) {
      await prisma.cZone.update({
        where: { id: czone.id },
        data: { layoutData: { zones: fixedZones } }
      })
    }
  }

  console.log(`[repair-czone-images] Done. Checked: ${checkedCount}, ${dryRun ? 'Would repair' : 'Repaired'}: ${repairedCount}`)
}

main()
  .catch((err) => {
    console.error('[repair-czone-images] Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
