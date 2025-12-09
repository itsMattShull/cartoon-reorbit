import 'dotenv/config'
import { prisma } from '../server/prisma.js'

async function seedGlobalConfig() {
  // Singleton row controlling global point caps, etc.
  await prisma.globalGameConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      dailyPointLimit: 100,
      dailyLoginPoints: 500,
      dailyNewUserPoints: 1000,
      czoneVisitPoints: 20,
      czoneVisitMaxPerDay: 10,
      scavengerChancePercent: 5,
      scavengerCooldownHours: 24
    }
  })
}

async function seedGameConfigs() {
  // Winball config (cup points and optional grand prize)
  await prisma.gameConfig.upsert({
    where: { gameName: 'Winball' },
    update: {},
    create: {
      gameName: 'Winball',
      leftCupPoints: 1000,
      rightCupPoints: 1000,
      goldCupPoints: 2000
    }
  })

  // Clash config (points per win)
  await prisma.gameConfig.upsert({
    where: { gameName: 'Clash' },
    update: {},
    create: {
      gameName: 'Clash',
      pointsPerWin: 500
    }
  })

  // Winwheel config (spin cost, optional image)
  await prisma.gameConfig.upsert({
    where: { gameName: 'Winwheel' },
    update: {},
    create: {
      gameName: 'Winwheel',
      spinCost: 50,
      pointsWon: 500,
      maxDailySpins: 10,
      winWheelImagePath: null
    }
  })
}

async function seedHomepageConfig() {
  // Homepage images (admin can update later). Use sane defaults matching UI fallbacks.
  await prisma.homepageConfig.upsert({
    where: { id: 'homepage' },
    update: {},
    create: {
      id: 'homepage',
      topLeftImagePath: '/images/welcome2.png',
      bottomLeftImagePath: '/images/gtoonsbanner.png',
      topRightImagePath: '/images/posterOct25.png',
      bottomRightImagePath: '/images/ZoidsWinball.png',
      showcaseImagePath: '/images/posterOct25.png'
    }
  })
}

async function seedLottoSettings() {
  await prisma.lottoSettings.upsert({
    where: { id: 'lotto' },
    update: {
      baseOdds: 1.0,
      incrementRate: 0.02,
      countPerDay: 5,
      cost: 50 // Ensure cost is updated to 50
    },
    create: {
      id: 'lotto',
      baseOdds: 1.0,
      incrementRate: 0.02,
      countPerDay: 5,
      cost: 50 // Set the default cost to 50 here
    }
  })
  console.log('Seeded LottoSettings (defaults)')
}

async function seedCtoonsIfEmpty() {
  const count = await prisma.ctoon.count()
  if (count > 0) {
    console.log(`Skipping cToon seed: ${count} already present`)
    return
  }

  const mapAsset = (p) =>
    process.env.NODE_ENV === 'production'
      ? p.replace(/^\/cToons\//, '/images/cToons/')
      : p

  // Note: This list is adapted from prisma/drops/addFirstDrop.js (dev variant),
  // with production path mapping handled via mapAsset.
  const baseCtoons = [
    // Batman
    { name: 'Bat Signal (Top)', series: 'Batman', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Batman/BM_batsig_2_1_1fm1.gif', quantity: 3,  perUserLimit: 1, inCmart: false, price: 500, set: 'Original' },
    { name: 'Bat Signal (Middle)', series: 'Batman', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Batman/BM_batsig_2_2_1fm1.gif', quantity: 3,  perUserLimit: 1, inCmart: false, price: 500, set: 'Original' },
    { name: 'Bat Signal (Bottom)', series: 'Batman', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Batman/BM_batsig_2_3_1fm1.gif', quantity: 3,  perUserLimit: 1, inCmart: false, price: 500, set: 'Original' },

    // Dexter’s Lab
    { name: 'Dee Dee', series: 'Dexters Lab', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Dexters Lab/DEX_deedee_1_2_1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Valentine Mandark', series: 'Dexters Lab', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Dexters Lab/valentines_mandark_fm1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Watcher Dexter', series: 'Dexters Lab', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Dexters Lab/watcher_dexter_fm1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },

    // Ed, Edd n Eddy
    { name: 'Ed (Run)', series: 'Ed Edd n Eddy', type: 'image/gif', rarity: 'Common', assetPath: '/cToons/Ed Edd n Eddy/eddrun_FM1.gif', quantity: null, perUserLimit: null, inCmart: true, price: 150, set: 'Original' },
    { name: 'Space Outlaw Ed', series: 'Ed Edd n Eddy', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Ed Edd n Eddy/space_outlaw_ed.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Space Outlaw Edd', series: 'Ed Edd n Eddy', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Ed Edd n Eddy/space_outlaw_edd.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Space Outlaw Eddy', series: 'Ed Edd n Eddy', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Ed Edd n Eddy/space_outlaw_eddy.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },

    // Justice League
    { name: 'Fearless Flash', series: 'Justice League', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Justice League/fearless_flash_fm1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'The Batman', series: 'Justice League', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Justice League/the_batman_fm1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Undaunted Hawkgirl', series: 'Justice League', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Justice League/undaunted_hawkgirl_fm1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },

    // Powerpuff Girls
    { name: 'Funky Blue Bubbles', series: 'Powerpuff Girls', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Powerpuff Girls/funky_blue_bubbles_fm1[1].gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Funky Green Buttercup', series: 'Powerpuff Girls', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Powerpuff Girls/funky_green_buttercup_fm1[1].gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Funky Pink Blossom', series: 'Powerpuff Girls', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Powerpuff Girls/funky_pink_blossom_fm1[1].gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },

    // Scooby Doo and others
    { name: 'Lazy Scooby', series: 'Scooby Doo', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Scooby Doo/lazy_scooby_fm1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Shaggy', series: 'Scooby Doo', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Scooby Doo/shaggy_FM1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Velma', series: 'Scooby Doo', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Scooby Doo/velma_fm1.gif', quantity: null, perUserLimit: 1, inCmart: false, price: 150, set: 'Original' },
    { name: 'Watcher Yogi', series: 'Yogi Bear', type: 'image/gif', rarity: 'Common', assetPath: '/cToons/Yogi Bear/watcher_yogi.gif', quantity: null, perUserLimit: null, inCmart: true, price: 50, set: 'Original' },
    { name: 'Space Ghost (Flying)', series: 'Space Ghost', type: 'image/gif', rarity: 'Common', assetPath: '/cToons/Space Ghost/space_ghost_flying.gif', quantity: null, perUserLimit: null, inCmart: true, price: 100, set: 'Original' },
    { name: 'Obi-Wan Kenobi', series: 'Star Wars', type: 'image/gif', rarity: 'Common', assetPath: '/cToons/Star Wars/obi-wan.gif', quantity: null, perUserLimit: null, inCmart: true, price: 50, set: 'Original' },
    { name: 'Skeletor', series: 'He-Man and the Masters of the Universe', type: 'image/gif', rarity: 'Common', assetPath: '/cToons/He-Man and the Masters of the Universe/skeletor.gif', quantity: null, perUserLimit: null, inCmart: true, price: 50, set: 'Original' },
    { name: 'Private John Stewart', series: 'Justice League', type: 'image/gif', rarity: 'Common', assetPath: '/cToons/Justice League/private_john_stewart.gif', quantity: null, perUserLimit: null, inCmart: true, price: 100, set: 'Original' },
    { name: 'Hamtaro', series: 'Hamtaro', type: 'image/gif', rarity: 'Uncommon', assetPath: '/cToons/Hamtaro/hamtaro.gif', quantity: null, perUserLimit: 2, inCmart: true, price: 150, set: 'Original' },
    { name: 'Johnny Bravo', series: 'Johnny Bravo', type: 'image/gif', rarity: 'Uncommon', assetPath: '/cToons/Johnny Bravo/johnny_bravo_posing.gif', quantity: null, perUserLimit: 2, inCmart: true, price: 150, set: 'Original' },
    { name: 'Schoolgirl Sakura', series: 'Cardcaptors', type: 'image/gif', rarity: 'Uncommon', assetPath: '/cToons/Cardcaptors/schoolgirl_sakura.gif', quantity: null, perUserLimit: 2, inCmart: true, price: 200, set: 'Original' },
    { name: 'Fred Flintstone (Mowing)', series: 'The Flintstones', type: 'image/gif', rarity: 'Uncommon', assetPath: '/cToons/The Flintstones/fred_mowing.gif', quantity: null, perUserLimit: 2, inCmart: true, price: 250, set: 'Original' },
    { name: 'Ed Edd n Eddy', series: 'Ed Edd n Eddy', type: 'image/gif', rarity: 'Rare', assetPath: '/cToons/Ed Edd n Eddy/the_gang.gif', quantity: 100, perUserLimit: 2, inCmart: true, price: 350, set: 'Original' },
    { name: 'Huckleberry (Waving)', series: 'The Huckleberry Hound Show', type: 'image/gif', rarity: 'Rare', assetPath: '/cToons/The Huckleberry Hound Show/huck_waving.gif', quantity: 100, perUserLimit: 2, inCmart: true, price: 350, set: 'Original' },
    { name: 'Kungfu Hong Kong Phooey', series: 'Hong Kong Phooey', type: 'image/gif', rarity: 'Rare', assetPath: '/cToons/Hong Kong Phooey/kungfu_hong_kong_phooey.gif', quantity: 100, perUserLimit: 2, inCmart: true, price: 350, set: 'Original' },
    { name: 'Cybersuit Dexter', series: 'Dexters Lab', type: 'image/gif', rarity: 'Very Rare', assetPath: '/cToons/Dexters Lab/cybersuit_dexter.gif', quantity: 100, perUserLimit: 1, inCmart: true, price: 700, set: 'Original' },
    { name: 'Charizard', series: 'Pokemon', type: 'image/gif', rarity: 'Very Rare', assetPath: '/cToons/Pokemon/charizard.gif', quantity: 100, perUserLimit: 1, inCmart: true, price: 800, set: 'Original' },
    { name: 'Goku', series: 'Dragon Ball Z', type: 'image/gif', rarity: 'Crazy Rare', assetPath: '/cToons/Dragon Ball Z/goku_standing_fm1.gif', quantity: 50, perUserLimit: 1, inCmart: true, price: 1200, set: 'Original' }
  ]

  const data = baseCtoons.map(item => ({
    name: item.name,
    series: item.series,
    type: item.type,
    rarity: item.rarity,
    assetPath: mapAsset(item.assetPath),
    releaseDate: new Date(),
    perUserLimit: item.perUserLimit ?? null,
    inCmart: item.inCmart,
    price: item.price,
    set: item.set,
    quantity: item.quantity ?? null
  }))

  await prisma.ctoon.createMany({ data })
  console.log(`Seeded initial cToons: ${data.length}`)
}

async function seedStarterSets() {
  // Create three starter sets; on re-run, keep existing item selections.
  const setsMeta = [
    { key: 'starter-1', name: 'Starter Set 1', sortOrder: 1 },
    { key: 'starter-2', name: 'Starter Set 2', sortOrder: 2 },
    { key: 'starter-3', name: 'Starter Set 3', sortOrder: 3 }
  ]

  // Ensure sets exist
  const sets = []
  for (const meta of setsMeta) {
    const set = await prisma.starterSet.upsert({
      where: { key: meta.key },
      update: { name: meta.name, isActive: true, sortOrder: meta.sortOrder },
      create: { key: meta.key, name: meta.name, isActive: true, sortOrder: meta.sortOrder }
    })
    sets.push(set)
  }

  // If items are already present, do not re-randomize; otherwise choose 3 random non–Crazy Rare cToons for each set.
  const eligible = await prisma.ctoon.findMany({
    where: { rarity: { not: 'Crazy Rare' } },
    select: { id: true }
  })
  if (!eligible.length) return

  const pickUnique = (pool, n) => {
    const arr = [...pool]
    const out = []
    for (let i = 0; i < n && arr.length; i++) {
      const idx = Math.floor(Math.random() * arr.length)
      out.push(arr.splice(idx, 1)[0])
    }
    return out
  }

  for (const set of sets) {
    const count = await prisma.starterSetItem.count({ where: { setId: set.id } })
    if (count > 0) continue

    const chosen = pickUnique(eligible.map(e => e.id), 3)
    for (let i = 0; i < chosen.length; i++) {
      await prisma.starterSetItem.create({
        data: { setId: set.id, ctoonId: chosen[i], position: i + 1 }
      })
    }
    console.log(`Starter set "${set.name}" seeded with ${chosen.length} items.`)
  }
}

async function main() {
  console.log('Seeding GlobalGameConfig…')
  await seedGlobalConfig()

  console.log('Seeding GameConfig entries…')
  await seedGameConfigs()

  console.log('Seeding HomepageConfig…')
  await seedHomepageConfig()

  console.log('Seeding LottoSettings…')
  await seedLottoSettings()

  console.log('Seeding cToons (if none exist)…')
  await seedCtoonsIfEmpty()

  console.log('Seeding Starter Sets…')
  await seedStarterSets()

  console.log('✅ Seed completed')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
