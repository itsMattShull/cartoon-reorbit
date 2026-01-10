// prisma/syncTotalMinted.js
// Syncs Ctoon.totalMinted with the actual count of UserCtoon rows per cToon.
// Includes burned UserCtoon rows in the count.
// For Holiday Item cToons, adds the number of HolidayRedemption rows where
// that cToon appears as the item (itemCtoonId), to account for opened boxes
// that may have been deleted after redemption.
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

  console.log(`🔢 Syncing Ctoon.totalMinted with actual counts (${APPLY ? 'apply' : 'dry-run'})…`)

  // Count all UserCtoon rows per cToon (includes burned)
  const ucCounts = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    _count: { _all: true }
  })
  const ucMap = new Map(ucCounts.map(r => [r.ctoonId, r._count._all]))

  // Count HolidayRedemption rows by itemCtoonId
  const redCounts = await prisma.holidayRedemption.groupBy({
    by: ['itemCtoonId'],
    _count: { _all: true }
  })
  const redItemMap = new Map(redCounts.map(r => [r.itemCtoonId, r._count._all]))

  // Inspect all cToons
  const ctoons = await prisma.ctoon.findMany({
    select: { id: true, name: true, totalMinted: true }
  })

  let changed = 0
  for (const c of ctoons) {
    const userTotal = ucMap.get(c.id) ?? 0
    const redTotal  = redItemMap.get(c.id) ?? 0
    const expected  = userTotal + redTotal
    if (c.totalMinted !== expected) {
      const suffix = redTotal > 0 ? ` (users=${userTotal} + redemptions=${redTotal})` : ` (users=${userTotal})`
      console.log(`• ${c.id}${c.name ? ` (${c.name})` : ''}: totalMinted ${APPLY ? '→' : 'would →'} ${expected}${suffix} (was ${c.totalMinted})`)
      if (APPLY) {
        await prisma.ctoon.update({ where: { id: c.id }, data: { totalMinted: expected } })
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
