// server/scripts/fix-user-ctoons.js
import { prisma } from '../server/prisma.js'

async function main() {
  // 1) Gather all distinct ctoonIds
  const distinct = await prisma.userCtoon.findMany({
    distinct: ['ctoonId'],
    select: { ctoonId: true }
  })
  const ctoonIds = distinct.map(d => d.ctoonId)
  console.log(`Found ${ctoonIds.length} distinct ctoons…`)

  // 2) Load all initialQuantities in one go
  const ctoonInfos = await prisma.ctoon.findMany({
    where: { id: { in: ctoonIds } },
    select: { id: true, initialQuantity: true }
  })
  const qtyMap = {}
  for (const { id, initialQuantity } of ctoonInfos) {
    qtyMap[id] = initialQuantity  // may be null
  }

  // 3) For each ctoonId, reorder & fix
  for (const ctoonId of ctoonIds) {
    const initialQty = qtyMap[ctoonId]  // null means unlimited

    // fetch all UserCtoons for this ctoon, sorted by creation time
    const owners = await prisma.userCtoon.findMany({
      where: { ctoonId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, mintNumber: true, isFirstEdition: true }
    })

    // reassign mintNumber & isFirstEdition
    for (let idx = 0; idx < owners.length; idx++) {
      const { id, mintNumber, isFirstEdition } = owners[idx]
      const correctMint = idx + 1
      // first‐edition if within initialQuantity or initialQuantity is null
      const shouldFirst = initialQty == null || correctMint <= initialQty

      // only update if something’s changed
      if (mintNumber !== correctMint || isFirstEdition !== shouldFirst) {
        await prisma.userCtoon.update({
          where: { id },
          data: {
            mintNumber:     correctMint,
            isFirstEdition: shouldFirst
          }
        })
        console.log(
          `Updated [ctoon ${id}]: ` +
          `mintNumber ${mintNumber}→${correctMint}, ` +
          `isFirstEdition ${isFirstEdition}→${shouldFirst}`
        )
      }
    }
  }

  console.log('✅ All UserCtoons fixed!')
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
