// scripts/updateWheelSpinMethod.js
import { prisma } from '../server/prisma.js'

async function main() {
  console.log('🔄 Updating all "wheel-spin" entries to "Game - Win Wheel"...')

  const result = await prisma.pointsLog.updateMany({
    where: { method: 'wheel-spin' },
    data: { method: 'Game - Win Wheel' },
  })

  console.log(`✅ Updated ${result.count} pointsLog record(s).`)
}

main()
  .catch(e => {
    console.error('⚠️  Error during update:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
