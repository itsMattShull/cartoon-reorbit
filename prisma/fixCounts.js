// server/scripts/fixCount.js
import { prisma } from '../server/prisma.js'

async function main() {
  // 1) Zero all Ctoons
  const zeroRes = await prisma.ctoon.updateMany({ data: { totalMinted: 0 } })

  // 2) Count UserCtoon per ctoonId
  const grouped = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    _count: { _all: true },
  })

  if (grouped.length === 0) {
    console.log(`Zeroed ${zeroRes.count} cToons. No UserCtoon rows found.`)
    return
  }

  // 3) Update counts
  const ops = grouped.map(g =>
    prisma.ctoon.update({
      where: { id: g.ctoonId },
      data: { totalMinted: g._count._all },
      select: { id: true },
    })
  )
  const results = await prisma.$transaction(ops)

  console.log(`Zeroed: ${zeroRes.count}`)
  console.log(`Updated totalMinted for: ${results.length} cToons`)
}

main()
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
  .finally(() => {})
