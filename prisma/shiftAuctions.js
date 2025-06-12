// scripts/shiftAuctions.js
import { prisma } from '@/server/prisma'

async function main() {
  // how many milliseconds is 21h40m?
  const deltaMs = ((21 * 60) + 40) * 60 * 1000

  // fetch all auctions (only id + endAt needed)
  const auctions = await prisma.auction.findMany({
    select: { id: true, endAt: true }
  })

  for (const { id, endAt } of auctions) {
    // skip any null endAt (if that's possible in your schema)
    if (!endAt) continue

    const oldDate = new Date(endAt)
    const newDate = new Date(oldDate.getTime() - deltaMs)

    await prisma.auction.update({
      where: { id },
      data: { endAt: newDate }
    })

    console.log(`▶ Auction ${id}: endAt ${oldDate.toISOString()} → ${newDate.toISOString()}`)
  }
}

main()
  .catch(err => {
    console.error('✖ error shifting auctions:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
