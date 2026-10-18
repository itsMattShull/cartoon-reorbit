// prisma/unlimitedOgGtoons.js
// Makes every OG gToon Ctoon an unlimited mint by nulling quantity, initialQuantity
// and perUserLimit (NULL means unlimited / no limit).
//
// Dry-run by default (logs what would change). Pass --apply to write updates.
//
// Usage:
//   node prisma/unlimitedOgGtoons.js        # dry-run
//   node prisma/unlimitedOgGtoons.js --apply # apply updates

import 'dotenv/config'
import { prisma } from '../server/prisma.js'

const APPLY = process.argv.includes('--apply')

async function main() {
  const where = {
    isOgGtoon: true,
    OR: [
      { quantity: { not: null } },
      { initialQuantity: { not: null } },
      { perUserLimit: { not: null } }
    ]
  }

  const total = await prisma.ctoon.count({ where: { isOgGtoon: true } })
  const rows = await prisma.ctoon.findMany({
    where,
    select: { id: true, name: true, quantity: true, initialQuantity: true, perUserLimit: true }
  })

  console.log(`OG gToons total: ${total}; needing update: ${rows.length}`)
  for (const r of rows) {
    console.log(`- ${r.name} (${r.id}): quantity=${r.quantity} initialQuantity=${r.initialQuantity} perUserLimit=${r.perUserLimit}`)
  }

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to write changes.')
    return
  }

  const res = await prisma.ctoon.updateMany({
    where,
    data: { quantity: null, initialQuantity: null, perUserLimit: null }
  })
  console.log(`Updated ${res.count} OG gToon Ctoon records.`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
