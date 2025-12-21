// prisma/fixDuplicateMintNumbers.js
// Scans for duplicate (ctoonId, mintNumber) in UserCtoon and fixes them by
// reassigning duplicates to the next available mint numbers per cToon.
// Also updates Ctoon.totalMinted to at least the highest assigned mintNumber
// to keep it in sync with the new atomic minting logic.
//
// Usage:
//   node prisma/fixDuplicateMintNumbers.js
//
// Notes:
// - If a cToon has a quantity set and all numbers within [1..quantity] are
//   already used uniquely, this script will assign new mint numbers above
//   quantity to achieve uniqueness, and will log a warning.
// - Updates CtoonOwnerLog.mintNumber snapshots for affected UserCtoon rows.

import { prisma } from '../server/prisma.js'

function nextAvailableNumber(used) {
  let n = 1
  while (used.has(n)) n++
  used.add(n)
  return n
}

async function fixDuplicatesForCtoon(ctoonId) {
  return await prisma.$transaction(async tx => {
    const ctoon = await tx.ctoon.findUnique({
      where: { id: ctoonId },
      select: { id: true, initialQuantity: true, quantity: true, totalMinted: true, name: true }
    })
    if (!ctoon) return { ctoonId, name: null, updated: 0, newMax: null, warnings: ['Ctoon not found'] }

    // Fetch all rows with a non‑null mintNumber, ordered to keep earliest as canonical
    const rows = await tx.userCtoon.findMany({
      where: { ctoonId, mintNumber: { not: null } },
      select: { id: true, mintNumber: true, createdAt: true },
      orderBy: [{ mintNumber: 'asc' }, { createdAt: 'asc' }]
    })

    const used = new Set()
    const updates = []

    for (const row of rows) {
      const num = row.mintNumber
      if (!used.has(num)) {
        used.add(num)
        continue
      }
      // Duplicate: assign the smallest available positive integer
      const newNum = nextAvailableNumber(used)
      updates.push({ id: row.id, old: num, new: newNum })
    }

    // Apply updates
    for (const up of updates) {
      const isFirstEdition =
        ctoon.initialQuantity == null || up.new <= ctoon.initialQuantity
      await tx.userCtoon.update({
        where: { id: up.id },
        data: { mintNumber: up.new, isFirstEdition }
      })
      await tx.ctoonOwnerLog.updateMany({
        where: { userCtoonId: up.id },
        data: { mintNumber: up.new }
      })
    }

    // Ensure totalMinted >= highest assigned mint number
    const newMax = used.size ? Math.max(...used) : ctoon.totalMinted
    const warnings = []
    if (ctoon.quantity != null && newMax > ctoon.quantity) {
      warnings.push(
        `Assigned mint numbers exceed quantity (${newMax} > ${ctoon.quantity}).` +
          ' This preserves uniqueness but indicates supply has been exceeded.'
      )
    }
    if (newMax != null && ctoon.totalMinted < newMax) {
      await tx.ctoon.update({ where: { id: ctoonId }, data: { totalMinted: newMax } })
    }

    return { ctoonId, name: ctoon.name, updated: updates.length, newMax, warnings }
  })
} 

async function main() {
  console.log('🔎 Scanning for duplicate mint numbers…')
  // Identify cToons that have duplicate mint numbers via SQL for efficiency
  const dupRows = await prisma.$queryRaw`
    SELECT "ctoonId", "mintNumber", COUNT(*) AS c
    FROM "UserCtoon"
    WHERE "mintNumber" IS NOT NULL
    GROUP BY "ctoonId", "mintNumber"
    HAVING COUNT(*) > 1
  `

  const ctoonIds = [...new Set(dupRows.map(r => r.ctoonId))]

  if (ctoonIds.length === 0) {
    console.log('✅ No duplicates found. Nothing to do.')
    return
  }

  console.log(`Found duplicates across ${ctoonIds.length} cToon(s). Fixing…`)
  let totalUpdates = 0
  const results = []

  for (const ctoonId of ctoonIds) {
    try {
      const res = await fixDuplicatesForCtoon(ctoonId)
      totalUpdates += res.updated
      results.push(res)
      const nameInfo = res.name ? ` (${res.name})` : ''
      console.log(`• ${ctoonId}${nameInfo}: reassigned ${res.updated} duplicate(s); newMax = ${res.newMax}`)
      for (const w of res.warnings || []) console.warn(`  ⚠️  ${w}`)
    } catch (err) {
      console.error(`❌ Failed to fix duplicates for ${ctoonId}:`, err?.message || err)
    }
  }

  console.log('✅ Done fixing duplicates.')
  console.log(`   cToons touched: ${results.length}`)
  console.log(`   UserCtoon rows updated: ${totalUpdates}`)
}

main().catch(err => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})

