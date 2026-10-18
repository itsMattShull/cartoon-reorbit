// prisma/createGoodbyeClashCode.js
// Creates the claim code GOODBYECLASHYOULLBEMISSED, mirroring what the admin "Add Code" page +
// POST /api/admin/codes do:
//   - max claims 99999, available from October 19, 2026 at 8:00 PM Central (America/Chicago, the
//     "CST/CDT" the admin pages use — so that is CDT, 01:00 UTC on Oct 20), no expiry,
//   - no prerequisite cToons,
//   - ONE reward batch that uses pooled cToon rewards: each claim gives out 12 unique cToons drawn
//     from a pool of every COMMON original gToon in prisma/ogGtoonsData/pack-card-names.json (the
//     same 103-card list as the pack), each with weight 1 — one entry per card, none favoured,
//   - no fixed cToon rewards, no backgrounds, no points.
//
// Cards are matched by Ctoon.name among isOgGtoon cards (the ones prisma/createOgGtoonsFromCsv.js
// created), keeping only those whose rarity is "Common". If a card in the list is missing, the
// script lists it and creates nothing.
//
// Idempotent: if the code already exists nothing is changed.
//
// Usage:  node prisma/createGoodbyeClashCode.js
//         DRY_RUN=true node prisma/createGoodbyeClashCode.js     # validate only: no DB writes

import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../server/prisma.js'

const DRY_RUN = String(process.env.DRY_RUN || 'false') === 'true'

const CODE = 'GOODBYECLASHYOULLBEMISSED'
const MAX_CLAIMS = 99999
const STARTS_AT_LOCAL = { y: 2026, m: 10, d: 19, h: 20, mi: 0 } // Central time
const POOL_UNIQUE_COUNT = 12 // "Number to give out"
const POOL_RARITY = 'Common'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** The UTC instant at which America/Chicago's wall clock reads `local` (same method as the admin pack page). */
function centralLocalToUTC({ y, m, d, h, mi }) {
  const utcGuessMs = Date.UTC(y, m - 1, d, h, mi, 0)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const shown = Object.fromEntries(
    fmt.formatToParts(new Date(utcGuessMs)).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  )
  const zonalMs = Date.UTC(+shown.year, +shown.month - 1, +shown.day, +shown.hour % 24, +shown.minute, +shown.second)
  return new Date(utcGuessMs - (zonalMs - utcGuessMs))
}

async function main() {
  const startsAt = centralLocalToUTC(STARTS_AT_LOCAL)
  const names = JSON.parse(await readFile(join(__dirname, 'ogGtoonsData', 'pack-card-names.json'), 'utf8'))

  const existing = await prisma.claimCode.findUnique({ where: { code: CODE }, select: { id: true } })
  if (existing) {
    console.log(`Code ${CODE} already exists (${existing.id}) — nothing to do.`)
    return
  }

  const rows = await prisma.ctoon.findMany({
    where: { isOgGtoon: true, name: { in: names } },
    select: { id: true, name: true, rarity: true },
    orderBy: { createdAt: 'asc' }
  })
  const byName = new Map()
  for (const r of rows) {
    if (byName.has(r.name)) console.warn(`  ! more than one original gToon named "${r.name}" — using the oldest`)
    else byName.set(r.name, r)
  }
  const missing = names.filter(n => !byName.has(n))
  if (missing.length) {
    console.error(`${missing.length} card(s) not found as original gToons (run prisma/createOgGtoonsFromCsv.js first):`)
    missing.forEach(n => console.error('  •', n))
    process.exitCode = 1
    return
  }

  const pool = names.map(n => byName.get(n)).filter(c => c.rarity === POOL_RARITY)
  if (pool.length < POOL_UNIQUE_COUNT) throw new Error(`Only ${pool.length} ${POOL_RARITY} card(s) in the list; the pool must hold at least ${POOL_UNIQUE_COUNT}`)
  console.log(`Pool: ${pool.length} ${POOL_RARITY} original gToons (of ${names.length} listed), weight 1 each.`)

  if (DRY_RUN) {
    console.log(`DRY RUN: would create ${CODE} (max ${MAX_CLAIMS}, starts ${startsAt.toISOString()}, gives out ${POOL_UNIQUE_COUNT}). Nothing written.`)
    return
  }

  const created = await prisma.claimCode.create({
    data: {
      code: CODE,
      maxClaims: MAX_CLAIMS,
      startsAt,
      expiresAt: null,
      prereqMinOwned: null,
      rewards: {
        create: [{
          points: 0,
          pooledUniqueCount: POOL_UNIQUE_COUNT,
          poolCtoons: { create: pool.map(c => ({ ctoonId: c.id, weight: 1 })) }
        }]
      }
    }
  })
  console.log(`✅ Created code ${created.code} (${created.id}): ${MAX_CLAIMS} claims, starts ${startsAt.toISOString()} (Oct 19, 8:00 PM Central), pooled reward gives out ${POOL_UNIQUE_COUNT} of ${pool.length}.`)
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
