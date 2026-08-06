// prisma/backfillCzoneDisplayCount.js
// One-time backfill for Ctoon.czoneDisplayCount, run once after the
// migration that adds the column (and safe to re-run any time by hand —
// it's the same idempotent recompute server/cron/czone-display-count.js
// runs nightly, just triggered manually instead of waiting for 5am CST).
//
// Usage:
//   node prisma/backfillCzoneDisplayCount.js

import { runCzoneDisplayCountAggregate } from '../server/cron/czone-display-count.js'
import { prisma } from '../server/prisma.js'

async function main() {
  console.log('🔢 Backfilling Ctoon.czoneDisplayCount…')
  await runCzoneDisplayCountAggregate()
  console.log('✅ Done.')
}

main()
  .catch(err => {
    console.error('❌ Unexpected error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
