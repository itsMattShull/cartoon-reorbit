// prisma/fixMintsOfCtoon.js
// Renumbers mint numbers for a specific cToon starting at 1, in created order,
// then updates Ctoon.totalMinted to match the row count.
// Dry-run by default; pass --apply to write changes.
//
// Usage:
//   node prisma/fixMintsOfCtoon.js         # dry-run
//   node prisma/fixMintsOfCtoon.js --apply # apply updates

import { prisma } from '../server/prisma.js'

const TARGET_NAME = 'Kids WB Static Shock'

function buildPlan(rows) {
  return rows.map((row, idx) => ({
    id: row.id,
    old: row.mintNumber,
    new: idx + 1
  }))
}

function previewChanges(changes, limit = 10) {
  return changes
    .slice(0, limit)
    .map(c => `${c.old ?? 'null'}->${c.new}`)
    .join(', ')
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const APPLY = args.has('--apply') || args.has('-a')

  console.log(`Renumbering mint numbers for "${TARGET_NAME}" (${APPLY ? 'apply' : 'dry-run'})`)

  const ctoons = await prisma.ctoon.findMany({
    where: { name: TARGET_NAME },
    select: { id: true, name: true, totalMinted: true, initialQuantity: true }
  })

  if (ctoons.length === 0) {
    console.error(`No cToon found with name "${TARGET_NAME}".`)
    process.exit(1)
  }
  if (ctoons.length > 1) {
    console.error(`Found ${ctoons.length} cToons with name "${TARGET_NAME}".`)
    for (const c of ctoons) console.error(`   - ${c.id}`)
    process.exit(1)
  }

  const ctoon = ctoons[0]

  const rows = await prisma.userCtoon.findMany({
    where: { ctoonId: ctoon.id },
    select: { id: true, mintNumber: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  })

  if (rows.length === 0) {
    console.log('No UserCtoon rows found. Nothing to renumber.')
    if (APPLY && ctoon.totalMinted !== 0) {
      await prisma.ctoon.update({ where: { id: ctoon.id }, data: { totalMinted: 0 } })
      console.log(`Updated totalMinted to 0 for ${ctoon.id}`)
    } else if (!APPLY && ctoon.totalMinted !== 0) {
      console.log(`- totalMinted would update to 0 (was ${ctoon.totalMinted})`)
    }
    return
  }

  const plan = buildPlan(rows)
  const changes = plan.filter(p => p.old !== p.new)
  const newTotal = rows.length

  console.log(`- cToon: ${ctoon.id} (${ctoon.name})`)
  console.log(`- rows: ${rows.length}`)
  console.log(`- mint updates: ${changes.length}`)
  if (ctoon.totalMinted !== newTotal) {
    console.log(`- totalMinted ${APPLY ? '->' : 'would ->'} ${newTotal} (was ${ctoon.totalMinted})`)
  } else {
    console.log('- totalMinted already correct')
  }
  if (changes.length) {
    console.log(`- preview: ${previewChanges(changes)}${changes.length > 10 ? ', ...' : ''}`)
  }

  if (!APPLY) {
    console.log('Dry-run complete. Re-run with --apply to write changes.')
    return
  }

  await prisma.$transaction(async tx => {
    if (changes.length) {
      const mintNumbers = rows.map(r => r.mintNumber).filter(n => n != null)
      const minMint = mintNumbers.length ? Math.min(...mintNumbers) : 1
      const tempBase = minMint <= 0 ? minMint - rows.length - 1 : -1

      let tempIndex = 0
      for (const change of changes) {
        const temp = tempBase - tempIndex
        tempIndex++
        await tx.userCtoon.update({
          where: { id: change.id },
          data: { mintNumber: temp }
        })
      }

      for (const change of changes) {
        const isFirstEdition =
          ctoon.initialQuantity == null || change.new <= ctoon.initialQuantity
        await tx.userCtoon.update({
          where: { id: change.id },
          data: { mintNumber: change.new, isFirstEdition }
        })
        await tx.ctoonOwnerLog.updateMany({
          where: { userCtoonId: change.id },
          data: { mintNumber: change.new }
        })
      }
    }

    if (ctoon.totalMinted !== newTotal) {
      await tx.ctoon.update({
        where: { id: ctoon.id },
        data: { totalMinted: newTotal }
      })
    }
  })

  console.log('Done. Changes applied.')
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
