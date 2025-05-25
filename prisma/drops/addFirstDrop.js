import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ctoons = [
    /* Batman */
    {
      name: 'Bat Signal (Top)',
      series: 'Batman',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Batman/BM_batsig_2_1_1fm1.gif',
      quantity: 3,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 500,
      set: 'Original'
    },
    {
      name: 'Bat Signal (Middle)',
      series: 'Batman',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Batman/BM_batsig_2_2_1fm1.gif',
      quantity: 3,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 500,
      set: 'Original'
    },
    {
      name: 'Bat Signal (Bottom)',
      series: 'Batman',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Batman/BM_batsig_2_3_1fm1.gif',
      quantity: 3,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 500,
      set: 'Original'
    },
  
    /* Dexter’s Lab */
    {
      name: 'Dee Dee',
      series: 'Dexters Lab',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Dexters Lab/DEX_deedee_1_2_1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Valentine Mandark',
      series: 'Dexters Lab',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Dexters Lab/valentines_mandark_fm1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Watcher Dexter',
      series: 'Dexters Lab',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Dexters Lab/watcher_dexter_fm1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },  
    /* Ed, Edd n Eddy */
    {
      name: 'Ed (Run)',
      series: 'Ed Edd n Eddy',
      type: 'image/gif',
      rarity: 'Common',
      assetPath: '/images/cToons/Ed Edd n Eddy/eddrun_FM1.gif',
      quantity: null,
      perUserLimit: null,
      releaseDate: new Date(),
      inCmart: true,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Space Outlaw Ed',
      series: 'Ed Edd n Eddy',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Ed Edd n Eddy/space_outlaw_ed.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Space Outlaw Edd',
      series: 'Ed Edd n Eddy',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Ed Edd n Eddy/space_outlaw_edd.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Space Outlaw Eddy',
      series: 'Ed Edd n Eddy',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Ed Edd n Eddy/space_outlaw_eddy.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
  
    /* Justice League */
    {
      name: 'Fearless Flash',
      series: 'Justice League',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Justice League/fearless_flash_fm1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'The Batman',
      series: 'Justice League',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Justice League/the_batman_fm1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Undaunted Hawkgirl',
      series: 'Justice League',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Justice League/undaunted_hawkgirl_fm1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
  
    /* Powerpuff Girls */
    {
      name: 'Funky Blue Bubbles',
      series: 'Powerpuff Girls',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Powerpuff Girls/funky_blue_bubbles_fm1[1].gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Funky Green Buttercup',
      series: 'Powerpuff Girls',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Powerpuff Girls/funky_green_buttercup_fm1[1].gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Funky Pink Blossom',
      series: 'Powerpuff Girls',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Powerpuff Girls/funky_pink_blossom_fm1[1].gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
  
    /* Scooby Doo */
    {
      name: 'Lazy Scooby',
      series: 'Scooby Doo',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Scooby Doo/lazy_scooby_fm1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Shaggy',
      series: 'Scooby Doo',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Scooby Doo/shaggy_FM1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Velma',
      series: 'Scooby Doo',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Scooby Doo/velma_fm1.gif',
      quantity: null,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: false,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Watcher Yogi',
      series: 'Yogi Bear',
      type: 'image/gif',
      rarity: 'Common',
      assetPath: '/images/cToons/Yogi Bear/watcher_yogi.gif',
      quantity: null,
      perUserLimit: null,
      releaseDate: new Date(),
      inCmart: true,
      price: 50,
      set: 'Original'
    },
    {
      name: 'Space Ghost (Flying)',
      series: 'Space Ghost',
      type: 'image/gif',
      rarity: 'Common',
      assetPath: '/images/cToons/Space Ghost/space_ghost_flying.gif',
      quantity: null,
      perUserLimit: null,
      releaseDate: new Date(),
      inCmart: true,
      price: 100,
      set: 'Original'
    },
    {
      name: 'Obi-Wan Kenobi',
      series: 'Star Wars',
      type: 'image/gif',
      rarity: 'Common',
      assetPath: '/images/cToons/Star Wars/obi-wan.gif',
      quantity: null,
      perUserLimit: null,
      releaseDate: new Date(),
      inCmart: true,
      price: 50,
      set: 'Original'
    },
    {
      name: 'Skeletor',
      series: 'He-Man and the Masters of the Universe',
      type: 'image/gif',
      rarity: 'Common',
      assetPath: '/images/cToons/He-Man and the Masters of the Universe/skeletor.gif',
      quantity: null,
      perUserLimit: null,
      releaseDate: new Date(),
      inCmart: true,
      price: 50,
      set: 'Original'
    },
    {
      name: 'Private John Stewart',
      series: 'Justice League',
      type: 'image/gif',
      rarity: 'Common',
      assetPath: '/images/cToons/Justice League/private_john_stewart.gif',
      quantity: null,
      perUserLimit: null,
      releaseDate: new Date(),
      inCmart: true,
      price: 100,
      set: 'Original'
    },
    {
      name: 'Hamtaro',
      series: 'Hamtaro',
      type: 'image/gif',
      rarity: 'Uncommon',
      assetPath: '/images/cToons/Hamtaro/hamtaro.gif',
      quantity: null,
      perUserLimit: 2,
      releaseDate: new Date(),
      inCmart: true,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Johnny Bravo',
      series: 'Johnny Bravo',
      type: 'image/gif',
      rarity: 'Uncommon',
      assetPath: '/images/cToons/Johnny Bravo/johnny_bravo_posing.gif',
      quantity: null,
      perUserLimit: 2,
      releaseDate: new Date(),
      inCmart: true,
      price: 150,
      set: 'Original'
    },
    {
      name: 'Schoolgirl Sakura',
      series: 'Cardcaptors',
      type: 'image/gif',
      rarity: 'Uncommon',
      assetPath: '/images/cToons/Cardcaptors/schoolgirl_sakura.gif',
      quantity: null,
      perUserLimit: 2,
      releaseDate: new Date(),
      inCmart: true,
      price: 200,
      set: 'Original'
    },
    {
      name: 'Fred Flintstone (Mowing)',
      series: 'Cardcaptors',
      type: 'image/gif',
      rarity: 'Uncommon',
      assetPath: '/images/cToons/Flintstones/fred_mowing.gif',
      quantity: null,
      perUserLimit: 2,
      releaseDate: new Date(),
      inCmart: true,
      price: 250,
      set: 'Original'
    },
    {
      name: 'Ed Edd n Eddy',
      series: 'Ed Edd n Eddy',
      type: 'image/gif',
      rarity: 'Rare',
      assetPath: '/images/cToons/Ed Edd n Eddy/the_gang.gif',
      quantity: 100,
      perUserLimit: 2,
      releaseDate: new Date(),
      inCmart: true,
      price: 350,
      set: 'Original'
    },
    {
      name: 'Huckleberry (Waving)',
      series: 'The Huckleberry Hound Show',
      type: 'image/gif',
      rarity: 'Rare',
      assetPath: '/images/cToons/The Huckleberry Hound Show/huck_waving.gif',
      quantity: 100,
      perUserLimit: 2,
      releaseDate: new Date(),
      inCmart: true,
      price: 350,
      set: 'Original'
    },
    {
      name: 'Kungfu Hong Kong Phooey',
      series: 'Hong Kong Phooey',
      type: 'image/gif',
      rarity: 'Rare',
      assetPath: '/images/cToons/Hong Kong Phooey/kungfu_hong_kong_phooey.gif',
      quantity: 100,
      perUserLimit: 2,
      releaseDate: new Date(),
      inCmart: true,
      price: 350,
      set: 'Original'
    },
    {
      name: 'Cybersuit Dexter',
      series: 'Dexters Lab',
      type: 'image/gif',
      rarity: 'Very Rare',
      assetPath: '/images/cToons/Dexters Lab/cybersuit_dexter.gif',
      quantity: 100,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: true,
      price: 700,
      set: 'Original'
    },
    {
      name: 'Charizard',
      series: 'Pokemon',
      type: 'image/gif',
      rarity: 'Very Rare',
      assetPath: '/images/cToons/Pokemon/charizard.gif',
      quantity: 100,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: true,
      price: 800,
      set: 'Original'
    },
    {
      name: 'Goku',
      series: 'Dragon Ball Z',
      type: 'image/gif',
      rarity: 'Crazy Rare',
      assetPath: '/images/cToons/Dragon Ball Z/goku_standing_fm1.gif',
      quantity: 50,
      perUserLimit: 1,
      releaseDate: new Date(),
      inCmart: true,
      price: 1200,
      set: 'Original'
    }
  ]

  const createdCtoons = await Promise.all(
    ctoons.map(data => prisma.ctoon.create({ data }))
  )
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())