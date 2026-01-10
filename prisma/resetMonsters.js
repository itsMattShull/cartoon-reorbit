// server/scripts/resetMonsters.js
// Deletes all barcode/monster-related rows except ItemDefinition and SpeciesBaseStats.

import { prisma } from '../server/prisma.js'

async function resetMonsters() {
  const targets = [
    {
      label: 'MonsterBattle',
      flag: '--monster-battle',
      count: () => prisma.monsterBattle.count(),
      del: () => prisma.monsterBattle.deleteMany(),
    },
    {
      label: 'UserBarcodeScan',
      flag: '--user-barcode-scan',
      count: () => prisma.userBarcodeScan.count(),
      del: () => prisma.userBarcodeScan.deleteMany(),
    },
    {
      label: 'UserMonsterItem',
      flag: '--user-monster-item',
      count: () => prisma.userMonsterItem.count(),
      del: () => prisma.userMonsterItem.deleteMany(),
    },
    {
      label: 'UserMonster',
      flag: '--user-monster',
      count: () => prisma.userMonster.count(),
      del: () => prisma.userMonster.deleteMany(),
    },
    {
      label: 'BarcodeMapping',
      flag: '--barcode-mapping',
      count: () => prisma.barcodeMapping.count(),
      del: () => prisma.barcodeMapping.deleteMany(),
    },
  ]

  const args = process.argv.slice(2)
  const argSet = new Set(args)
  const knownFlags = new Set([
    '--dry-run',
    '--help',
    '-h',
    ...targets.map((t) => t.flag),
  ])
  const unknownFlags = args.filter((arg) => arg.startsWith('-') && !knownFlags.has(arg))
  if (unknownFlags.length > 0 || argSet.has('--help') || argSet.has('-h')) {
    console.log('Usage: node prisma/resetMonsters.js [flags]')
    console.log('')
    console.log('Flags (must be provided to delete each target):')
    targets.forEach((t) => console.log(`  ${t.flag}`))
    console.log('')
    console.log('Optional:')
    console.log('  --dry-run   Show counts only (no deletes)')
    console.log('')
    console.log('Examples:')
    console.log('  node prisma/resetMonsters.js')
    console.log('  node prisma/resetMonsters.js --user-monster --user-monster-item')
    if (unknownFlags.length > 0) {
      console.error(`\nUnknown flag(s): ${unknownFlags.join(', ')}`)
      process.exitCode = 1
    }
    return
  }

  const requestedTargets = targets.filter((t) => argSet.has(t.flag))
  const hasSelectionArgs = requestedTargets.length > 0
  const dryRun = args.length === 0 || argSet.has('--dry-run')
  const selectedTargets = hasSelectionArgs ? requestedTargets : targets

  const runTarget = async (target) => {
    try {
      if (dryRun) {
        const count = await target.count()
        console.log(`• ${target.label}: would delete ${count}`)
        return
      }
      const res = await target.del()
      console.log(`• ${target.label}: deleted ${res.count}`)
    } catch (e) {
      console.error(`✗ ${target.label}:`, e.message)
      throw e
    }
  }

  try {
    console.log(
      `🧹 Resetting barcode/monster tables (keeping ItemDefinition + SpeciesBaseStats)...${dryRun ? ' (dry run)' : ''}\n`
    )

    // Dependents first
    for (const target of selectedTargets) {
      await runTarget(target)
    }

    console.log(
      `\n✅ Done: barcode/monster data ${dryRun ? 'checked' : 'cleared'} (items/species preserved).`
    )
  } catch (err) {
    console.error('\n❌ Reset failed:', err)
    process.exitCode = 1
  } finally {
    // no explicit disconnect
  }
}

resetMonsters()
