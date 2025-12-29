import { prisma } from '../server/prisma.js'

async function main() {
  const ctoons = await prisma.ctoon.findMany({
    where: {
      inCmart: false,
      quantity: { not: null },
      rarity: { in: ['Common', 'Uncommon', 'Rare', 'Very Rare'] },
      packOptions: { some: {} }
    },
    select: {
      name: true,
      totalMinted: true,
      quantity: true
    },
    orderBy: { name: 'asc' }
  })

  const available = ctoons.filter(ctoon => ctoon.totalMinted < ctoon.quantity)

  if (available.length === 0) {
    console.log('No matching cToons found.')
    return
  }

  console.log('cToons with inCmart=false, in a pack, and totalMinted < quantity:')
  for (const ctoon of available) {
    console.log(`${ctoon.name} (${ctoon.totalMinted}/${ctoon.quantity})`)
  }
  console.log(`Total: ${available.length}`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {})
