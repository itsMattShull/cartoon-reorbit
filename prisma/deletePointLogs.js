// removeZeroPointsLogs.js

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  // Delete all PointsLog records with points = 0
  const result = await prisma.pointsLog.deleteMany({
    where: {
      points: 0
    }
  })

  console.log(`✅ Deleted ${result.count} PointsLog record(s) with 0 points.`)
}

main()
  .catch((err) => {
    console.error('❌ Error deleting zero‐point logs:', err)
    process.exit(1)
  })
  .finally(async () => {})
