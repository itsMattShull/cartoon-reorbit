// prisma/backfillCzoneZones.js
// Convert legacy CZone.layoutData arrays into { zones: [...] } format.

import { prisma } from '../server/prisma.js'

const args = process.argv.slice(2)
const argSet = new Set(args)
const dryRun = !argSet.has('--apply')

let targetCount = null
for (const arg of args) {
  if (arg.startsWith('--count=')) {
    const raw = Number(arg.split('=')[1])
    if (Number.isFinite(raw) && raw >= 1) targetCount = Math.floor(raw)
  }
}

if (argSet.has('--help') || argSet.has('-h')) {
  console.log('Usage: node prisma/backfillCzoneZones.js [options]')
  console.log('')
  console.log('Options:')
  console.log('  --apply          Perform updates (default: dry run)')
  console.log('  --count=<n>      Target zone count for padding (default: global czoneCount or 3)')
  console.log('  --help, -h       Show this help')
  process.exit(0)
}

async function resolveTargetCount() {
  if (Number.isFinite(targetCount) && targetCount >= 1) return targetCount
  const cfg = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { czoneCount: true }
  })
  return Math.max(1, Number(cfg?.czoneCount ?? 3))
}

async function main() {
  const count = await resolveTargetCount()
  const zones = await prisma.cZone.findMany({
    select: { id: true, userId: true, layoutData: true, background: true }
  })

  let updated = 0
  let skipped = 0

  for (const zone of zones) {
    if (!Array.isArray(zone.layoutData)) {
      skipped += 1
      continue
    }

    const bg0 = typeof zone.background === 'string' ? zone.background : ''
    const nextZones = [{ background: bg0, toons: zone.layoutData }]
    while (nextZones.length < count) {
      nextZones.push({ background: '', toons: [] })
    }

    updated += 1
    if (!dryRun) {
      await prisma.cZone.update({
        where: { id: zone.id },
        data: { layoutData: { zones: nextZones } }
      })
    }
  }

  console.log(`CZone rows scanned: ${zones.length}`)
  console.log(`Legacy layouts updated: ${updated}${dryRun ? ' (dry run)' : ''}`)
  console.log(`Already in zones format: ${skipped}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
