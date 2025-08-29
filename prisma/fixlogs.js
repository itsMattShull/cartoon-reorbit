// scripts/snapshotCtoonOwnerLogs.js
import { prisma } from '../server/prisma.js'

const BATCH_SIZE = 1000

async function main() {
  console.log('🧩 Creating CtoonOwnerLog snapshots for current owners...')
  let scanned = 0
  let created = 0
  let cursor = null

  for (;;) {
    const batch = await prisma.userCtoon.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, userId: true, ctoonId: true, mintNumber: true }
    })
    if (!batch.length) break
    scanned += batch.length
    cursor = batch[batch.length - 1].id

    const ucIds = batch.map(b => b.id)
    const existing = await prisma.ctoonOwnerLog.findMany({
      where: { userCtoonId: { in: ucIds } },
      select: { userCtoonId: true, userId: true }
    })
    const have = new Set(existing.map(e => `${e.userCtoonId}:${e.userId || ''}`))

    const toInsert = batch
      .filter(b => !have.has(`${b.id}:${b.userId}`))
      .map(b => ({
        userId: b.userId,
        ctoonId: b.ctoonId,
        userCtoonId: b.id,
        mintNumber: b.mintNumber ?? null
        // createdAt will default to now()
      }))

    if (toInsert.length) {
      const res = await prisma.ctoonOwnerLog.createMany({ data: toInsert })
      created += res.count
      console.log(`Batch: scanned ${batch.length}, inserted ${res.count}`)
    } else {
      console.log(`Batch: scanned ${batch.length}, inserted 0`)
    }
  }

  console.log(`✅ Done. Scanned ${scanned}. Created ${created} log row(s).`)
}

main()
  .catch(e => {
    console.error('⚠️  Error during snapshot:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
