// prisma/fixDuplicateMintNumbers.js
// Scans for duplicate (ctoonId, mintNumber) in UserCtoon and prepares fixes.
// By default this is a dry‑run and only logs planned changes.
// With --apply, performs the updates.
// With --compact, also renumbers to a contiguous 1..N sequence per cToon
// (i.e., fills gaps like …1,2,4 → 1,2,3).
// Also updates Ctoon.totalMinted to at least the highest assigned mintNumber
// to keep it in sync with the new atomic minting logic. With --check-total,
// compares Ctoon.totalMinted to the actual UserCtoon count and (with --apply)
// updates it to match the count.
//
// Usage:
//   node prisma/fixDuplicateMintNumbers.js           # dry-run, duplicates only
//   node prisma/fixDuplicateMintNumbers.js --apply   # apply duplicates fix
//   node prisma/fixDuplicateMintNumbers.js --compact # dry-run incl. gap compaction
//   node prisma/fixDuplicateMintNumbers.js --compact --apply # apply compaction
//   node prisma/fixDuplicateMintNumbers.js --check-total       # dry-run: show Ctoon.totalMinted vs actual counts
//   node prisma/fixDuplicateMintNumbers.js --check-total --apply # apply: set Ctoon.totalMinted = UserCtoon count
//   node prisma/fixDuplicateMintNumbers.js --compact --apply --check-total # combine fixes + totals sync
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
  const CHECK_TOTAL = args.has('--check-total') || args.has('-t')

  console.log(`🔎 Mode: ${COMPACT ? 'compact gaps + fix duplicates' : 'fix duplicates only'}${CHECK_TOTAL ? ' + check totals' : ''} (${APPLY ? 'apply' : 'dry-run'})`)

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

  let totalUpdates = 0
  const results = []

  if (allIds.size > 0) {
    console.log(`Found ${dupSet.size} cToon(s) with duplicates${COMPACT ? `; ${gapSet.size} with gaps` : ''}. Processing…`)
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
  } else {
    console.log('✅ No duplicates or gaps found.')
  }

  // Optional: check and fix Ctoon.totalMinted vs actual count
  if (CHECK_TOTAL) {
    console.log('🔢 Checking Ctoon.totalMinted against actual UserCtoon counts…')
    const counts = await prisma.userCtoon.groupBy({
      by: ['ctoonId'],
      _count: { _all: true }
    })
    const countMap = new Map(counts.map(r => [r.ctoonId, r._count._all]))

    // Ctoons with any mismatch (including those with zero count but nonzero totalMinted)
    const ctoonsToInspect = await prisma.ctoon.findMany({
      where: {
        OR: [
          { id: { in: Array.from(countMap.keys()) } },
          { totalMinted: { gt: 0 } }
        ]
      },
      select: { id: true, name: true, totalMinted: true }
    })

    let totalCtoonUpdated = 0
    for (const c of ctoonsToInspect) {
      const actual = countMap.get(c.id) ?? 0
      if (c.totalMinted !== actual) {
        console.log(`• ${c.id}${c.name ? ` (${c.name})` : ''}: totalMinted ${APPLY ? '→' : 'would →'} ${actual} (was ${c.totalMinted})`)
        if (APPLY) {
          await prisma.ctoon.update({ where: { id: c.id }, data: { totalMinted: actual } })
          totalCtoonUpdated++
        }
      }
    }
    console.log(`📈 ${APPLY ? 'Updated' : 'Would update'} totalMinted for ${totalCtoonUpdated} cToon(s).`)
  }

  console.log(`✅ Done (${APPLY ? 'applied' : 'dry-run'}).`)
  console.log(`   cToons processed (dups/gaps): ${results.length}`)
  console.log(`   UserCtoon rows ${APPLY ? 'updated' : 'would update'}: ${totalUpdates}`)
  if (!APPLY) {
    console.log('   To apply fixes, rerun with --apply. To compact gaps too, add --compact. To sync totals, add --check-total.')
  }
}

main().catch(err => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
