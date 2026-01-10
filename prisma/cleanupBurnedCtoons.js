// prisma/cleanupBurnedCtoons.js
// Clean burned holiday gifts from cZone layouts and optionally delete safe UserCtoon rows.

import { prisma } from '../server/prisma.js'

const args = process.argv.slice(2)
const argSet = new Set(args)

if (argSet.has('--help') || argSet.has('-h')) {
  console.log('Usage: node prisma/cleanupBurnedCtoons.js [options]')
  console.log('')
  console.log('Options:')
  console.log('  --apply         Perform updates/deletes (default: dry run)')
  console.log('  --skip-czones   Skip cleaning cZone layoutData')
  console.log('  --skip-delete   Skip deleting burned UserCtoon rows')
  console.log('  --help, -h      Show this help')
  process.exit(0)
}

const dryRun = !argSet.has('--apply')
const cleanCzones = !argSet.has('--skip-czones')
const deleteBurned = !argSet.has('--skip-delete')

function getItemUserCtoonId(item) {
  if (!item || typeof item !== 'object') return null
  const id = item.userCtoonId || item.id
  return typeof id === 'string' ? id : null
}

function pruneToons(toons, burnedSet) {
  if (!Array.isArray(toons)) return { next: toons, removed: 0 }
  const next = []
  let removed = 0
  for (const item of toons) {
    const itemId = getItemUserCtoonId(item)
    if (itemId && burnedSet.has(itemId)) {
      removed += 1
      continue
    }
    next.push(item)
  }
  return { next, removed }
}

function pruneLayoutData(layoutData, burnedSet) {
  if (Array.isArray(layoutData)) {
    const { next, removed } = pruneToons(layoutData, burnedSet)
    return { changed: removed > 0, removed, nextLayoutData: next }
  }

  if (layoutData && typeof layoutData === 'object' && Array.isArray(layoutData.zones)) {
    let removedTotal = 0
    const updatedZones = layoutData.zones.map((zone) => {
      const { next, removed } = pruneToons(zone?.toons, burnedSet)
      removedTotal += removed
      if (!Array.isArray(zone?.toons)) return zone
      return { ...zone, toons: next }
    })
    return {
      changed: removedTotal > 0,
      removed: removedTotal,
      nextLayoutData: { ...layoutData, zones: updatedZones }
    }
  }

  return { changed: false, removed: 0, nextLayoutData: layoutData }
}

async function main() {
  const burnedRows = await prisma.userCtoon.findMany({
    where: { burnedAt: { not: null } },
    select: {
      id: true,
      userId: true,
      burnedAt: true,
      _count: {
        select: {
          tradeCtoons: true,
          tradeOfferCtoons: true,
          auctions: true,
          auctionOnlyListings: true
        }
      }
    }
  })

  const burnedIds = new Set(burnedRows.map((row) => row.id))
  console.log(`Burned UserCtoons found: ${burnedRows.length}${dryRun ? ' (dry run)' : ''}`)

  if (cleanCzones) {
    const cZones = await prisma.cZone.findMany({
      select: { id: true, layoutData: true }
    })

    let totalRemoved = 0
    let zonesUpdated = 0
    for (const zone of cZones) {
      const { changed, removed, nextLayoutData } = pruneLayoutData(zone.layoutData, burnedIds)
      if (!changed) continue
      totalRemoved += removed
      zonesUpdated += 1
      if (!dryRun) {
        await prisma.cZone.update({
          where: { id: zone.id },
          data: { layoutData: nextLayoutData }
        })
      }
    }

    console.log(`cZones scanned: ${cZones.length}`)
    console.log(`cZones updated: ${zonesUpdated}`)
    console.log(`cZone items removed: ${totalRemoved}`)
  }

  if (deleteBurned) {
    const deletable = burnedRows.filter((row) => {
      const counts = row._count
      return (
        counts.tradeCtoons === 0 &&
        counts.tradeOfferCtoons === 0 &&
        counts.auctions === 0 &&
        counts.auctionOnlyListings === 0
      )
    })

    console.log(`Burned UserCtoons safe to delete: ${deletable.length}`)

    if (!dryRun) {
      let deleted = 0
      let failed = 0
      for (const row of deletable) {
        try {
          await prisma.userCtoon.delete({ where: { id: row.id } })
          deleted += 1
        } catch (err) {
          failed += 1
          console.error(`Failed to delete UserCtoon ${row.id}: ${err.message}`)
        }
      }
      console.log(`Burned UserCtoons deleted: ${deleted}`)
      if (failed > 0) console.log(`Burned UserCtoons failed to delete: ${failed}`)
    }
  }

  if (!cleanCzones && !deleteBurned) {
    console.log('Nothing to do: both --skip-czones and --skip-delete were set.')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
