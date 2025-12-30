// server/scripts/resetMonsters.js
// Deletes all barcode/monster-related rows except ItemDefinition and SpeciesBaseStats.

import { prisma } from '../server/prisma.js'

async function resetMonsters() {
  const del = async (label, fn) => {
    try {
      const res = await fn()
      console.log(`• ${label}: deleted ${res.count}`)
    } catch (e) {
      console.error(`✗ ${label}:`, e.message)
      throw e
    }
  }

  try {
    console.log('🧹 Resetting barcode/monster tables (keeping ItemDefinition + SpeciesBaseStats)...\n')

    // Dependents first
    await del('MonsterBattle', () => prisma.monsterBattle.deleteMany())
    await del('UserBarcodeScan', () => prisma.userBarcodeScan.deleteMany())
    await del('UserMonsterItem', () => prisma.userMonsterItem.deleteMany())
    await del('UserMonster', () => prisma.userMonster.deleteMany())

    // Mappings (keep barcode config)
    await del('BarcodeMapping', () => prisma.barcodeMapping.deleteMany())

    console.log('\n✅ Done: barcode/monster data cleared (items/species preserved).')
  } catch (err) {
    console.error('\n❌ Reset failed:', err)
    process.exitCode = 1
  } finally {
    // no explicit disconnect
  }
}

resetMonsters()
