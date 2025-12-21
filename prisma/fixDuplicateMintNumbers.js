// prisma/fixDuplicateMintNumbers.js
// Scans for duplicate (ctoonId, mintNumber) in UserCtoon and prepares fixes.
// By default this is a dry‑run and only logs planned changes.
// With --apply, performs the updates.
// With --compact, also renumbers to a contiguous 1..N sequence per cToon
// (i.e., fills gaps like …1,2,4 → 1,2,3).
// Also updates Ctoon.totalMinted to at least the highest assigned mintNumber
// to keep it in sync with the new atomic minting logic.
//
// Usage:
//   node prisma/fixDuplicateMintNumbers.js           # dry-run, duplicates only
//   node prisma/fixDuplicateMintNumbers.js --apply   # apply duplicates fix
//   node prisma/fixDuplicateMintNumbers.js --compact # dry-run incl. gap compaction
//   node prisma/fixDuplicateMintNumbers.js --compact --apply # apply compaction
//
// Notes:
// - If a cToon has a quantity set and all numbers within [1..quantity] are
//   already used uniquely, this script will assign new mint numbers above
//   quantity to achieve uniqueness (only with --apply), and will log a warning.
// - Updates CtoonOwnerLog.mintNumber snapshots for affected UserCtoon rows.

import { prisma } from '../server/prisma.js'

function nextAvailableNumber(used) {
  let n = 1
  while (used.has(n)) n++
  used.add(n)
  return n
}

async function fixForCtoon(ctoonId, { compact = false, apply = false } = {}) {
  // Build plan; optionally apply inside a single transaction
  const plan = await prisma.$transaction(async tx => {
    const ctoon = await tx.ctoon.findUnique({
      where: { id: ctoonId },
      select: { id: true, initialQuantity: true, quantity: true, totalMinted: true, name: true }
    })
    if (!ctoon) return { ctoonId, name: null, updated: 0, newMax: null, warnings: ['Ctoon not found'], updates: [] }

    // Fetch all rows with a non‑null mintNumber
    const rows = await tx.userCtoon.findMany({
      where: { ctoonId, mintNumber: { not: null } },
      select: { id: true, mintNumber: true, createdAt: true },
      orderBy: [{ mintNumber: 'asc' }, { createdAt: 'asc' }]
    })

    const used = new Set()
    const updates = []

    if (compact) {
      // Renumber to contiguous 1..N based on current ordering
      let desired = 1
      for (const row of rows) {
        const old = row.mintNumber
        if (old !== desired) {
          updates.push({ id: row.id, old, new: desired })
        }
        used.add(desired)
        desired++
      }
    } else {
      // Only fix duplicates; keep first occurrence, move later ones into lowest gaps
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
    }

    // Apply updates
    if (apply && updates.length) {
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
    if (apply && newMax != null && ctoon.totalMinted < newMax) {
      await tx.ctoon.update({ where: { id: ctoonId }, data: { totalMinted: newMax } })
    }

    return { ctoonId, name: ctoon.name, updated: updates.length, newMax, warnings, updates }
  })

  return plan
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const APPLY = args.has('--apply') || args.has('-a')
  const COMPACT = args.has('--compact') || args.has('-c')

  console.log(`🔎 Mode: ${COMPACT ? 'compact gaps + fix duplicates' : 'fix duplicates only'} (${APPLY ? 'apply' : 'dry-run'})`)

  // Identify cToons with duplicate mint numbers
  const dupRows = await prisma.$queryRaw`
    SELECT "ctoonId", "mintNumber", COUNT(*) AS c
    FROM "UserCtoon"
    WHERE "mintNumber" IS NOT NULL
    GROUP BY "ctoonId", "mintNumber"
    HAVING COUNT(*) > 1
  `

  // Identify cToons with gaps (max > distinct count) — only needed when compacting
  let gapRows = []
  if (COMPACT) {
    gapRows = await prisma.$queryRaw`
      SELECT "ctoonId"
      FROM "UserCtoon"
      WHERE "mintNumber" IS NOT NULL
      GROUP BY "ctoonId"
      HAVING MAX("mintNumber") > COUNT(DISTINCT "mintNumber")
    `
  }

  const dupSet = new Set(dupRows.map(r => r.ctoonId))
  const gapSet = new Set(gapRows.map(r => r.ctoonId))
  const allIds = new Set([...dupSet, ...gapSet])

  if (allIds.size === 0) {
    console.log('✅ No duplicates or gaps found. Nothing to do.')
    return
  }

  console.log(`Found ${dupSet.size} cToon(s) with duplicates${COMPACT ? `; ${gapSet.size} with gaps` : ''}. Processing…`)
  let totalUpdates = 0
  const results = []

  for (const ctoonId of allIds) {
    try {
      const res = await fixForCtoon(ctoonId, { compact: COMPACT, apply: APPLY })
      totalUpdates += res.updated
      results.push(res)
      const nameInfo = res.name ? ` (${res.name})` : ''
      if (res.updated === 0) {
        console.log(`• ${ctoonId}${nameInfo}: no changes needed`)
      } else {
        console.log(`• ${ctoonId}${nameInfo}: ${APPLY ? 'updated' : 'would update'} ${res.updated} row(s); newMax = ${res.newMax}`)
        // Log a small preview of changes
        const preview = res.updates.slice(0, 10).map(u => `${u.old}→${u.new}`).join(', ')
        if (preview) console.log(`   changes: ${preview}${res.updates.length > 10 ? ', …' : ''}`)
      }
      for (const w of res.warnings || []) console.warn(`  ⚠️  ${w}`)
    } catch (err) {
      console.error(`❌ Failed to fix duplicates for ${ctoonId}:`, err?.message || err)
    }
  }

  console.log(`✅ Done (${APPLY ? 'applied' : 'dry-run'}).`)
  console.log(`   cToons processed: ${results.length}`)
  console.log(`   UserCtoon rows ${APPLY ? 'updated' : 'would update'}: ${totalUpdates}`)
  if (!APPLY) {
    console.log('   To apply fixes, rerun with --apply. To compact gaps too, add --compact.')
  }
}

main().catch(err => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
