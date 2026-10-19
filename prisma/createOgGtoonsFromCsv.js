// prisma/createOgGtoonsFromCsv.js
// Creates a Ctoon row for every original (2002) gToon in prisma/ogGtoonsData/gtoons-cards.csv,
// mirroring what the admin "Add cToon" page + POST /api/admin/ctoon do:
//   - the card image is MOVED out of public/cards/ into the cToons image folder
//     (public/cToons/<Series>/ in dev, <parent of cwd>/cartoon-reorbit-images/cToons/<Series>/ in
//     production) and Ctoon.assetPath points at it,
//   - perceptual image hashes are stored, rarity defaults (quantities / limit / price) are applied,
//   - the release date is 5 minutes from when the script runs,
//   - "Power Description" is translated through server/utils/ogGtoonPowerCatalog.js — the very same
//     catalog the admin Power combobox uses — so the effect JSON is what the game engine evaluates.
//
// Field mapping from the CSV:
//   Name -> name                Show Source -> series (blank for Huntor/Steve: see SHOW_SOURCE_FIXES)        "gToons " + Card Series -> set
//   Character -> characters[]   Rarity -> rarity              Color -> gtoonColor
//   Points -> gtoonValue        Type 1/2/3 -> gtoonType1/2/3  Group -> gtoonGroup
//   Power Description -> gtoonEffect (isSlamGtoon is left false: a power is not a Slam)
// Not in C-mart, not code-only, isOgGtoon = true.
//
// Image matching lives in prisma/ogGtoonsData/card-images.json (card name -> file in
// public/cards). Cards without an entry get a copy of prisma/ogGtoonsData/placeholder.png.
//
// Idempotent: a card is skipped when an original gToon with the same name + set already exists.
//
// IMPORTANT: on a server that serves images from the sibling cartoon-reorbit-images/ folder (the
// production layout used by the deployed sites, including a deployed "dev" site), run with
// NODE_ENV=production so files and assetPath ("/images/cToons/...") match what the admin page
// writes there. Without it the script uses the local-dev layout (public/cToons, "/cToons/...").
// Re-running with NODE_ENV=production also repairs cards an earlier dev-layout run created.
//
// Usage:  node prisma/createOgGtoonsFromCsv.js
//         NODE_ENV=production node prisma/createOgGtoonsFromCsv.js
//         DRY_RUN=true node prisma/createOgGtoonsFromCsv.js    # validate only: no DB, no file moves
//         IMAGES_BASE_DIR=/srv/app node prisma/createOgGtoonsFromCsv.js   # override image root

import 'dotenv/config'
import { readFile, mkdir, copyFile, unlink, access } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeMultiHash, bucketFromHash } from '../server/utils/multiHash.js'
import { sanitizePathSegment, sanitizeFilename, assertInside } from '../server/utils/imageUploadValidation.js'
import { OG_GTOON_POWER_CATALOG } from '../server/utils/ogGtoonPowerCatalog.js'

const DRY_RUN = String(process.env.DRY_RUN || 'false') === 'true'
const IS_PROD = process.env.NODE_ENV === 'production'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'ogGtoonsData')
const CARDS_DIR = resolve(__dirname, '..', 'public', 'cards')
const PLACEHOLDER = join(DATA_DIR, 'placeholder.png')
// Same layout as backfillCtoonHashes.js: in production the images folder is a sibling of the app dir.
const BASE_DIR = process.env.IMAGES_BASE_DIR ? resolve(process.env.IMAGES_BASE_DIR) : (IS_PROD ? resolve(process.cwd(), '..') : process.cwd())

const COLORS = new Set(['BLACK', 'SILVER', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK'])
const CARD_TYPES = new Set(['ANIMAL', 'FEMALE', 'HERO', 'MALE', 'MONSTER', 'PLACE', 'PROP', 'VEHICLE', 'VILLAIN'])
// CSV label -> GtoonGroup enum identifier (labels match the schema's @map values).
const GROUPS = {
  'Bean Scouts': 'BEAN_SCOUTS', 'Daily Planet': 'DAILY_PLANET', 'G.L.O.B.A.L.': 'GLOBAL',
  'Imaginary Friend': 'IMAGINARY_FRIEND', 'Injustice Gang': 'INJUSTICE_GANG', 'Justice Friends': 'JUSTICE_FRIENDS',
  'Justice League': 'JUSTICE_LEAGUE', 'Mucha Lucha': 'MUCHA_LUCHA', 'Mystery, Inc.': 'MYSTERY_INC',
  'Powerpuff Girls': 'POWERPUFF_GIRLS', 'Squirrel Scouts': 'SQUIRREL_SCOUTS', 'Teen Titans': 'TEEN_TITANS',
  'Time Squad': 'TIME_SQUAD', 'WOOHP': 'WOOHP'
}

// Same defaults as server/api/rarity-defaults.get.js (admin page applies these per rarity; the
// GlobalGameConfig row, when present, overrides them). Rarities with no entry (e.g. "Slam") are unlimited.
const RARITY_DEFAULTS = {
  'Common':       { totalQuantity: 160, initialQuantity: 160, perUserLimit: 7, price: 100 },
  'Uncommon':     { totalQuantity: 120, initialQuantity: 120, perUserLimit: 5, price: 200 },
  'Rare':         { totalQuantity: 80,  initialQuantity: 80,  perUserLimit: 3, price: 400 },
  'Very Rare':    { totalQuantity: 60,  initialQuantity: 60,  perUserLimit: 2, price: 750 },
  'Crazy Rare':   { totalQuantity: 40,  initialQuantity: 40,  perUserLimit: 1, price: 1250 }
}
// Two CSV rows have a blank Show Source; these are the values supplied for them.
const SHOW_SOURCE_FIXES = { Huntor: 'Looney Tunes', Steve: 'Powerpuff Girls' }
const FALLBACK_RARITY = 'Common' // used for the one CSV row (Fusilli) whose Rarity is blank

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/quotes/newlines). */
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) rows.push(row) }
  const header = rows.shift().map(h => h.replace(/^﻿/, '').trim())
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

const catalogByDescription = new Map(OG_GTOON_POWER_CATALOG.map(e => [e.description, e]))
const isNoPower = d => !d || /^no power$/i.test(d)

function buildCard(r) {
  const name = r['Name']
  const color = r['Color'].toUpperCase()
  if (!COLORS.has(color)) throw new Error(`"${name}": unknown color "${r['Color']}"`)
  const value = parseInt(r['Points'], 10)
  if (isNaN(value) || value < 0 || value > 99) throw new Error(`"${name}": bad points "${r['Points']}"`)
  const types = ['Type 1', 'Type 2', 'Type 3'].map(k => {
    const v = r[k].toUpperCase()
    if (!v) return null
    if (!CARD_TYPES.has(v)) throw new Error(`"${name}": unknown ${k} "${r[k]}"`)
    return v
  })
  let group = null
  if (r['Group']) {
    group = GROUPS[r['Group']]
    if (!group) throw new Error(`"${name}": unknown group "${r['Group']}"`)
  }
  let effect = null
  if (!isNoPower(r['Power Description'])) {
    const entry = catalogByDescription.get(r['Power Description'])
    if (!entry) throw new Error(`"${name}": power not in catalog: "${r['Power Description']}"`)
    effect = entry.effect
  }
  const series = r['Show Source'] || SHOW_SOURCE_FIXES[name]
  if (!series) throw new Error(`"${name}": missing Show Source`)
  return {
    name,
    series: sanitizePathSegment(series),
    set: `gToons ${r['Card Series']}`,
    rarity: r['Rarity'] || FALLBACK_RARITY,
    characters: [r['Character'] || name],
    color, value, types, group,
    effect: effect && effect.length ? effect : null
  }
}

const exists = p => access(p).then(() => true, () => false)

/**
 * Fixes a card an earlier run created in dev layout (assetPath "/cToons/..." with the file in the
 * repo's public/cToons) when this run is in production layout (served from the sibling
 * cartoon-reorbit-images/ folder under "/images/cToons/..."): moves the file and updates assetPath.
 */
async function repairAssetPath(prisma, ctoon) {
  if (!IS_PROD || !ctoon.assetPath?.startsWith('/cToons/')) return false
  const rel = ctoon.assetPath.slice('/cToons/'.length)
  const from = join(process.cwd(), 'public', 'cToons', rel)
  const to = join(BASE_DIR, 'cartoon-reorbit-images', 'cToons', rel)
  if (await exists(from)) {
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
    await unlink(from)
  } else if (!(await exists(to))) {
    console.warn(`  ! "${ctoon.name}": image missing at both ${from} and ${to}`)
    return false
  }
  await prisma.ctoon.update({ where: { id: ctoon.id }, data: { assetPath: `/images/cToons/${rel}` } })
  return true
}

async function main() {
  const cards = parseCsv(await readFile(join(DATA_DIR, 'gtoons-cards.csv'), 'utf8')).map(buildCard)
  const imageMap = JSON.parse(await readFile(join(DATA_DIR, 'card-images.json'), 'utf8'))
  console.log(`Parsed ${cards.length} cards from CSV (${Object.keys(imageMap).length} image matches, rest use the placeholder).`)

  if (DRY_RUN) {
    const missingFiles = []
    for (const c of cards) {
      const f = imageMap[c.name]
      if (f && !(await exists(join(CARDS_DIR, f)))) missingFiles.push(`${c.name} -> ${f}`)
    }
    console.log(`DRY RUN: all rows valid. Slam/power cards: ${cards.filter(c => c.effect).length}. Image files not found in public/cards: ${missingFiles.length}`)
    missingFiles.forEach(m => console.log('  •', m))
    return
  }

  const { prisma } = await import('../server/prisma.js')
  console.log(`Mode: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'} layout (NODE_ENV=${process.env.NODE_ENV || 'unset'}). Images go to ${IS_PROD ? join(BASE_DIR, 'cartoon-reorbit-images', 'cToons') : join(BASE_DIR, 'public', 'cToons')}`)
  try {
    let finalDelayHours = 12, initialPercent = 75, rarityDefaults = RARITY_DEFAULTS
    const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } }).catch(() => null)
    if (cfg) {
      if (typeof cfg.finalReleaseDelayHours === 'number') finalDelayHours = cfg.finalReleaseDelayHours
      if (typeof cfg.initialReleasePercent === 'number') initialPercent = cfg.initialReleasePercent
      if (cfg.rarityDefaults && typeof cfg.rarityDefaults === 'object') rarityDefaults = { ...RARITY_DEFAULTS, ...cfg.rarityDefaults }
    }

    const releaseDate = new Date(Date.now() + 5 * 60 * 1000)
    const finalReleaseAt = new Date(releaseDate.getTime() + finalDelayHours * 60 * 60 * 1000)
    let created = 0, skipped = 0, repaired = 0, placeholders = 0

    for (const c of cards) {
      const dup = await prisma.ctoon.findFirst({ where: { name: c.name, set: c.set, isOgGtoon: true }, select: { id: true, name: true, assetPath: true } })
      if (dup) {
        if (await repairAssetPath(prisma, dup)) { repaired++; console.log(`  • "${c.name}" already exists — moved its image to the production images folder`) }
        else { skipped++; console.log(`  • "${c.name}" (${c.set}) already exists — skipping`) }
        continue
      }

      // ── image: move from public/cards (or copy the placeholder) into the cToons folder ──
      const srcName = imageMap[c.name]
      const srcPath = srcName ? join(CARDS_DIR, srcName) : PLACEHOLDER
      const usePlaceholder = !srcName
      const destName = sanitizeFilename(srcName || `${c.name.toLowerCase().replace(/\s+/g, '_')}_placeholder.png`)
      const destDir = IS_PROD ? join(BASE_DIR, 'cartoon-reorbit-images', 'cToons', c.series) : join(BASE_DIR, 'public', 'cToons', c.series)
      const destPath = assertInside(destDir, join(destDir, destName))
      const assetPath = IS_PROD ? `/images/cToons/${c.series}/${destName}` : `/cToons/${c.series}/${destName}`

      let hashSource = srcPath
      if (!(await exists(srcPath))) {
        // Already moved by an earlier partial run — reuse the file at its destination.
        if (await exists(destPath)) hashSource = destPath
        else throw new Error(`Image for "${c.name}" not found: ${srcPath}`)
      }
      const { phash, dhash } = await computeMultiHash(await readFile(hashSource))
      await mkdir(destDir, { recursive: true })
      if (hashSource === srcPath) {
        await copyFile(srcPath, destPath)
        if (!usePlaceholder) await unlink(srcPath) // "move": copy+unlink works across devices
      }
      if (usePlaceholder) placeholders++

      // ── quantities / limits from the rarity defaults (never in C-mart, never code-only) ──
      const d = rarityDefaults[c.rarity] || {}
      const total = d.totalQuantity ?? null
      const initQty = total ? Math.max(1, Math.floor((total * initialPercent) / 100)) : null

      await prisma.ctoon.create({
        data: {
          name: c.name,
          series: c.series,
          set: c.set,
          rarity: c.rarity,
          type: 'image/png',
          assetPath,
          characters: c.characters,
          releaseDate,
          price: Number(d.price ?? 0),
          inCmart: false,
          codeOnly: false,
          quantity: total,
          initialQuantity: d.initialQuantity ?? null,
          perUserLimit: d.perUserLimit ?? null,
          mintLimitType: 'defined',
          initialReleaseAt: releaseDate,
          finalReleaseAt,
          initialReleaseQty: initQty,
          finalReleaseQty: total && initQty != null ? Math.max(0, total - initQty) : null,

          isOgGtoon: true,
          gtoonColor: c.color,
          gtoonValue: c.value,
          gtoonType1: c.types[0],
          gtoonType2: c.types[1],
          gtoonType3: c.types[2],
          gtoonGroup: c.group,
          // A power does not make a card a Slam gToon; that flag is set by hand in the admin.
          isSlamGtoon: false,
          gtoonEffect: c.effect,

          imageHash: { create: { phash, dhash, bucket: bucketFromHash(phash) } }
        }
      })
      created++
      console.log(`  • Created "${c.name}" [${c.set}]${usePlaceholder ? ' (placeholder image)' : ''}`)
    }
    console.log(`✅ Done: ${created} created (${placeholders} with placeholder images), ${skipped} skipped, ${repaired} image paths repaired.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
