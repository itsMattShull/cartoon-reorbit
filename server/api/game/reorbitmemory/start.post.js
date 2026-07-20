import { defineEventHandler, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { gridDimsForPairs, buildPositions, DEFAULT_PAIRS } from '@/server/utils/reorbitMemoryEngine'

const LOCK_TTL_MS = 10_000

function lockKey(userId) { return `reorbitmemory:lock:${userId}` }
function sessionKey(userId) { return `reorbitmemory:session:${userId}` }

function getDailyBoundary() {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let b = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < b) b = b.minus({ days: 1 })
  return b.toUTC().toJSDate()
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // Banned-user check
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { banned: true } })
  if (user?.banned) throw createError({ statusCode: 403, statusMessage: 'Account suspended' })

  // Per-user lock prevents concurrent /start requests (play-limit TOCTOU)
  const lockToken = crypto.randomUUID()
  let lockAcquired = false
  try {
    const r = await redis.set(lockKey(userId), lockToken, 'NX', 'PX', LOCK_TTL_MS)
    lockAcquired = r === 'OK'
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }
  if (!lockAcquired) throw createError({ statusCode: 429, statusMessage: 'Request already in progress' })

  const casRelease = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`

  try {
    const config = await prisma.gameConfig.findUnique({ where: { gameName: 'ReOrbitMemory' } })
    const pairs = config?.reorbitMemoryPairs ?? DEFAULT_PAIRS
    const playsPerPeriod = config?.reorbitMemoryPlaysPerPeriod ?? 3
    const timeSeconds = config?.reorbitMemoryTimeSeconds ?? null
    const flipBackDelayMs = config?.reorbitMemoryFlipBackDelayMs ?? 800
    const cardBackImagePath = config?.reorbitMemoryCardBackImagePath ?? null

    // Check play limit
    const boundary = getDailyBoundary()
    const playsToday = await prisma.reOrbitMemoryPlay.count({
      where: { userId, createdAt: { gte: boundary } }
    })
    if (playsToday >= playsPerPeriod) {
      const nextReset = new Date(boundary.getTime() + 24 * 60 * 60 * 1000)
      throw createError({
        statusCode: 429,
        statusMessage: 'Daily play limit reached',
        data: { nextReset: nextReset.toISOString() }
      })
    }

    // Pick `pairs` random, currently-released cToons directly in SQL — cheap regardless of
    // catalog size, unlike fetching the whole table and shuffling in Node.
    const candidates = await prisma.$queryRaw`
      SELECT "id", "assetPath" FROM "Ctoon"
      WHERE "releaseDate" IS NOT NULL AND "releaseDate" <= NOW()
      ORDER BY random()
      LIMIT ${pairs};
    `
    if (!candidates || candidates.length < pairs) {
      throw createError({ statusCode: 503, statusMessage: 'Not enough cToons available to start a game' })
    }

    const { cols, rows } = gridDimsForPairs(pairs)
    const seedHex = crypto.randomUUID().replace(/-/g, '')
    const positions = buildPositions(candidates.map(c => c.id), seedHex)
    const assetByCtoon = {}
    for (const c of candidates) assetByCtoon[c.id] = c.assetPath

    const ttlSeconds = timeSeconds ? timeSeconds + 120 : 900
    await redis.set(sessionKey(userId), JSON.stringify({
      pairs,
      positions,
      assetByCtoon,
      matched: new Array(pairs * 2).fill(0),
      pendingIndex: -1,
      moves: 0,
      startedAt: Date.now(),
      lastFlipAt: 0
    }), 'EX', ttlSeconds)

    // Record the play (inside the lock to prevent TOCTOU)
    await prisma.reOrbitMemoryPlay.create({ data: { userId } })

    // Safe to reveal: which images are in play this round, but not where — position is
    // exactly the information a flip has to pay for, so this doesn't shortcut gameplay.
    // Lets the client prefetch every card-front image before the player's first tap.
    const frontImages = candidates.map(c => c.assetPath)

    return { pairs, cols, rows, cardBackImagePath, timeSeconds, flipBackDelayMs, frontImages }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
