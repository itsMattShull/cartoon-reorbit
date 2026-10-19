// prisma/clearOgGtoonsSlam.js
// Sets Ctoon.isSlamGtoon = false on every cToon that has it on.
//
// "Slam gToon" turned out to be its own thing in the original game, not just "a gToon with a
// power", but the importer and the admin Power picker used to switch it on whenever a power was
// set. This undoes that. Only the flag changes: gtoonEffect is left alone, so every gToon keeps
// the power it already has.
//
// Dry-run by default (logs what would change). Pass --apply to write updates.
//
// Usage:
//   node prisma/clearOgGtoonsSlam.js        # dry-run
//   node prisma/clearOgGtoonsSlam.js --apply # apply updates

import 'dotenv/config'
import { prisma } from '../server/prisma.js'

const APPLY = process.argv.includes('--apply')

async function main() {
  const where = { isSlamGtoon: true }

  const rows = await prisma.ctoon.findMany({
    where,
    select: { id: true, name: true, isOgGtoon: true, gtoonEffect: true },
    orderBy: { name: 'asc' }
  })

  console.log(`cToons with isSlamGtoon = true: ${rows.length}`)
  for (const r of rows) {
    const hasPower = Array.isArray(r.gtoonEffect) && r.gtoonEffect.length > 0
    console.log(`- ${r.name} (${r.id})${r.isOgGtoon ? '' : ' [not an OG gToon]'}${hasPower ? ' [keeps its power]' : ''}`)
  }

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to write changes.')
    return
  }

  const res = await prisma.ctoon.updateMany({ where, data: { isSlamGtoon: false } })
  console.log(`Updated ${res.count} cToon records (isSlamGtoon -> false).`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
