import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {

  // --- Create test user (pretend Discord SSO user) ---
  const testUser = await prisma.user.upsert({
    where: { discordId: '123456789012345678' },
    update: {},
    create: {
      discordId: '123456789012345678',
      discordTag: 'TestUser#0001',
      discordAvatar: null
    }
  })

  // --- Add points to test user ---
  await prisma.userPoints.upsert({
    where: { userId: testUser.id },
    update: { points: 100 },
    create: { userId: testUser.id, points: 100 }
  })

  // --- Create some cToons ---
  await prisma.ctoon.createMany({
    data: [
      {
        name: 'Goku (Standing)',
        series: 'Dragon Ball Z',
        type: 'image/gif',
        rarity: 'uncommon',
        assetPath: '/cToons/Dragon Ball Z/goku_standing_fm1.gif',
        quantity: null,
        releaseDate: new Date(),
        inCmart: true,
        price: 150
      },
      {
        name: 'Edd (Running)',
        series: 'Ed, Edd n Eddy',
        type: 'image/gif',
        rarity: 'uncommon',
        assetPath: '/cToons/Ed Edd n Eddy/eddrun_FM1.gif',
        quantity: null,
        releaseDate: new Date(),
        inCmart: true,
        price: 200
      },
      {
        name: 'Bat Signal (Top)',
        series: 'Batman',
        type: 'image/gif',
        rarity: 'rare',
        assetPath: '/cToons/Batman/BM_batsig_2_1_1fm1.gif',
        quantity: 50,
        releaseDate: new Date(),
        inCmart: true,
        price: 350
      },
      {
        name: 'Bat Signal (Middle)',
        series: 'Batman',
        type: 'image/gif',
        rarity: 'rare',
        assetPath: '/cToons/Batman/BM_batsig_2_2_1fm1.gif',
        quantity: 50,
        releaseDate: new Date(),
        inCmart: true,
        price: 350
      },
      {
        name: 'Bat Signal (Bottom)',
        series: 'Batman',
        type: 'image/gif',
        rarity: 'rare',
        assetPath: '/cToons/Batman/BM_batsig_2_3_1fm1.gif',
        quantity: 50,
        releaseDate: new Date(),
        inCmart: true,
        price: 350
      }
    ]
  })

  // --- Give test user one cToon ---
  const dexter = await prisma.ctoon.findFirst({ where: { name: 'Dexter' } })
  await prisma.userCtoon.create({
    data: {
      userId: testUser.id,
      ctoonId: dexter.id,
      quantity: 1
    }
  })
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
