// prisma/syncTotalMinted.js
// Syncs Ctoon.totalMinted with the actual count of UserCtoon rows per cToon.
// Includes burned UserCtoon rows in the count.
//
// Dry-run by default (logs what would change). Pass --apply to write updates.
//
// Usage:
//   node prisma/syncTotalMinted.js        # dry-run
//   node prisma/syncTotalMinted.js --apply # apply updates
//
// Notes:
// - The count includes ALL UserCtoon rows for a cToon, regardless of
//   burnedAt or mintNumber being null.
// - This script does not modify UserCtoon rows or mint numbers; it only
//   updates Ctoon.totalMinted where different.

import { prisma } from '../server/prisma.js'

async function main() {
  const args = new Set(process.argv.slice(2))
  const APPLY = args.has('--apply') || args.has('-a')

  console.log(`🔢 Syncing Ctoon.totalMinted with actual UserCtoon counts (${APPLY ? 'apply' : 'dry-run'})…`)

  // Count all UserCtoon rows per cToon (includes burned)
  const counts = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    _count: { _all: true }
  })
  const countMap = new Map(counts.map(r => [r.ctoonId, r._count._all]))

  // Inspect all cToons
  const ctoons = await prisma.ctoon.findMany({
    select: { id: true, name: true, totalMinted: true }
  })

  let changed = 0
  for (const c of ctoons) {
    const actual = countMap.get(c.id) ?? 0
    if (c.totalMinted !== actual) {
      console.log(`• ${c.id}${c.name ? ` (${c.name})` : ''}: totalMinted ${APPLY ? '→' : 'would →'} ${actual} (was ${c.totalMinted})`)
      if (APPLY) {
        await prisma.ctoon.update({ where: { id: c.id }, data: { totalMinted: actual } })
        changed++
      }
    }
  }

  console.log(`✅ Done (${APPLY ? 'applied' : 'dry-run'}). ${APPLY ? 'Updated' : 'Would update'} ${changed} cToon(s).`)
}

main().catch(err => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})

