// prisma/createOgGtoonsPack.js
// Creates a Pack made of a fixed list of original (2002) gToons, mirroring what the admin "Add
// Pack" page + POST /api/admin/packs do:
//   - the thumbnail is a copy of prisma/ogGtoonsData/placeholder.png, written where the admin page
//     writes pack images (public/packs/ in dev, <parent of cwd>/cartoon-reorbit-images/packs/ in
//     production) and Pack.imagePath points at it — swap in the real art from the admin Packs page,
//   - the pack is NOT in the C-mart (inCmart = false) and has no schedule, so it never goes on sale
//     by itself; it can still be handed out (e.g. as a reward pack),
//   - every card in OG_GTOON_PACK_CARDS becomes a PackCtoonOption (weight 1). Cards are matched by
//     Ctoon.name among isOgGtoon cards, i.e. the ones prisma/createOgGtoonsFromCsv.js created,
//   - PackRarityConfig decides what one opened pack yields (see RARITY_CONFIGS below).
//
// Idempotent: if a Pack with PACK_NAME already exists nothing is changed. Every card must already
// exist; if any are missing the script lists them and creates nothing.
//
// IMPORTANT: on a server that serves images from the sibling cartoon-reorbit-images/ folder (the
// production layout, including a deployed "dev" site), run with NODE_ENV=production so the file and
// imagePath ("/images/packs/...") match what the admin page writes there.
//
// Usage:  node prisma/createOgGtoonsPack.js
//         NODE_ENV=production node prisma/createOgGtoonsPack.js
//         DRY_RUN=true node prisma/createOgGtoonsPack.js     # validate only: no DB writes, no files
//         PACK_NAME="My pack" node prisma/createOgGtoonsPack.js

import 'dotenv/config'
import { mkdir, copyFile, readFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../server/prisma.js'

const DRY_RUN = String(process.env.DRY_RUN || 'false') === 'true'
const IS_PROD = process.env.NODE_ENV === 'production'
const PACK_NAME = process.env.PACK_NAME || 'Original gToons Pack'
const PACK_DESCRIPTION = 'A random handful of original (2002) gToons.'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLACEHOLDER = join(__dirname, 'ogGtoonsData', 'placeholder.png')
// Same layout as createOgGtoonsFromCsv.js: in production the images folder is a sibling of the app dir.
const BASE_DIR = process.env.IMAGES_BASE_DIR ? resolve(process.env.IMAGES_BASE_DIR) : (IS_PROD ? resolve(process.cwd(), '..') : process.cwd())

// One opened pack: 3 Common + 2 Uncommon + 1 Rare, each rarity always included (at least one rarity
// must be 100%). Rarity names are the Ctoon.rarity values the import script stores.
const RARITY_CONFIGS = [
  { rarity: 'Common', count: 3, probabilityPercent: 100 },
  { rarity: 'Uncommon', count: 2, probabilityPercent: 100 },
  { rarity: 'Rare', count: 1, probabilityPercent: 100 }
]
// Same default as the admin page / GlobalGameConfig.packMaxDefaultBuysPerUser when that row is missing.
const FALLBACK_MAX_BUYS_PER_USER = 5

// The 103 original gToons that make up the pack (and the pool of the GOODBYECLASHYOULLBEMISSED code).
const OG_GTOON_PACK_CARDS = JSON.parse(await readFile(join(__dirname, 'ogGtoonsData', 'pack-card-names.json'), 'utf8'))

async function main() {
  if (new Set(OG_GTOON_PACK_CARDS).size !== OG_GTOON_PACK_CARDS.length) throw new Error('Duplicate name in OG_GTOON_PACK_CARDS')

  const existing = await prisma.pack.findFirst({ where: { name: PACK_NAME }, select: { id: true } })
  if (existing) {
    console.log(`Pack "${PACK_NAME}" already exists (${existing.id}) — nothing to do.`)
    return
  }

  const rows = await prisma.ctoon.findMany({
    where: { isOgGtoon: true, name: { in: OG_GTOON_PACK_CARDS } },
    select: { id: true, name: true, rarity: true },
    orderBy: { createdAt: 'asc' }
  })
  const byName = new Map()
  for (const r of rows) {
    if (byName.has(r.name)) console.warn(`  ! more than one original gToon named "${r.name}" — using the oldest`)
    else byName.set(r.name, r)
  }
  const missing = OG_GTOON_PACK_CARDS.filter(n => !byName.has(n))
  if (missing.length) {
    console.error(`${missing.length} card(s) not found as original gToons (run prisma/createOgGtoonsFromCsv.js first):`)
    missing.forEach(n => console.error('  •', n))
    process.exitCode = 1
    return
  }

  // Each configured rarity must have enough cards to fill the slots it promises.
  const byRarity = {}
  for (const c of byName.values()) (byRarity[c.rarity] ||= []).push(c)
  console.log('Cards by rarity:', Object.fromEntries(Object.entries(byRarity).map(([r, l]) => [r, l.length])))
  for (const rc of RARITY_CONFIGS) {
    const have = byRarity[rc.rarity]?.length || 0
    if (have < rc.count) throw new Error(`Rarity "${rc.rarity}" needs ${rc.count} card(s) per pack but only ${have} are in the pack`)
  }
  const unused = Object.keys(byRarity).filter(r => !RARITY_CONFIGS.some(rc => rc.rarity === r))
  if (unused.length) console.warn(`  ! cards of rarity ${unused.join(', ')} are in the pack but no rarity config draws them`)

  const imageDir = IS_PROD ? join(BASE_DIR, 'cartoon-reorbit-images', 'packs') : join(BASE_DIR, 'public', 'packs')
  const filename = `${Date.now()}_og-gtoons-pack-placeholder.png`
  const imagePath = IS_PROD ? `/images/packs/${filename}` : `/packs/${filename}`

  if (DRY_RUN) {
    console.log(`DRY RUN: would create "${PACK_NAME}" with ${byName.size} cards, image ${imagePath}, inCmart=false. Nothing written.`)
    return
  }

  const globalCfg = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { packMaxDefaultBuysPerUser: true }
  })

  await mkdir(imageDir, { recursive: true })
  await copyFile(PLACEHOLDER, join(imageDir, filename))

  const pack = await prisma.$transaction(async (tx) => {
    const created = await tx.pack.create({
      data: {
        name: PACK_NAME,
        description: PACK_DESCRIPTION,
        price: 0,
        imagePath,
        inCmart: false,
        maxBuysPerUser: globalCfg?.packMaxDefaultBuysPerUser ?? FALLBACK_MAX_BUYS_PER_USER
      }
    })
    await tx.packRarityConfig.createMany({ data: RARITY_CONFIGS.map(rc => ({ packId: created.id, ...rc })) })
    await tx.packCtoonOption.createMany({
      data: OG_GTOON_PACK_CARDS.map(name => ({ packId: created.id, ctoonId: byName.get(name).id, weight: 1 }))
    })
    return created
  })

  console.log(`✅ Created pack "${pack.name}" (${pack.id}) with ${OG_GTOON_PACK_CARDS.length} original gToons, not in the C-mart.`)
  console.log(`   Image: ${imagePath} (placeholder — replace it from the admin Packs page).`)
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
