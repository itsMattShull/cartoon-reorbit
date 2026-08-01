// Cached catalog pool for "Guess that cToon!".
//
// Distractor quality is the whole game, and it needs catalog-wide knowledge that a random
// sample cannot provide:
//
//   • same-series wrong answers — with ~50 series, an 80-row random sample contains three
//     same-series names only about a fifth of the time, so sampling per run would silently
//     degrade almost every question to generated mutations;
//   • collision checking — a recombined name like "Space Outlaw Ed" → "Space Outlaw Edd"
//     has to be checked against EVERY name, not just the ones in this run.
//
// So the whole (narrow) catalog is cached in Redis for five minutes and shared across app
// instances. At a few thousand cToons this is well under a megabyte, and it takes /start
// off the database entirely.
//
// Rows come from prisma.ctoon.findMany rather than $queryRaw on purpose: the client
// extension in server/prisma.js that swaps assetPath on April 1st only applies to model
// operations, so a raw query would leave this game showing un-swapped art while the rest of
// the site is swapped.
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'

const POOL_KEY = 'guessctoon:pool:v1'
const POOL_TTL_SECONDS = 300

// Control characters (\p{Cc}) and surrogate code points (\p{Cs}). Admin-entered names are
// free text, and a lone surrogate would make cjson throw inside ANSWER_SCRIPT — which would
// 500 every answer for that session, permanently. Sanitize once, here.
const UNSAFE_CHARS = /[\p{Cc}\p{Cs}]/gu

export async function getCatalogPool () {
  try {
    const cached = await redis.get(POOL_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch {
    // Cache miss or Redis hiccup — fall through to the database.
  }

  const rows = await prisma.ctoon.findMany({
    where: { releaseDate: { not: null, lte: new Date() } },
    select: {
      id: true,
      name: true,
      series: true,
      set: true,
      assetPath: true,
      rarity: true,
      inCmart: true,
      totalMinted: true,
      isSecondEdition: true,
      guessCtoonExcluded: true
    }
  })

  const clean = rows
    .filter(r => r && r.name && r.assetPath)
    .map(r => ({
      ...r,
      name: sanitizeText(r.name),
      series: r.series ? sanitizeText(r.series) : null,
      set: r.set ? sanitizeText(r.set) : null
    }))
    .filter(r => r.name.length > 0)

  try {
    await redis.set(POOL_KEY, JSON.stringify(clean), 'EX', POOL_TTL_SECONDS)
  } catch {
    // Non-fatal: the pool is a cache, not the source of truth.
  }

  return clean
}

function sanitizeText (value) {
  return String(value).replace(UNSAFE_CHARS, '').trim()
}

export { POOL_KEY, sanitizeText }
