import { defineEventHandler, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { BASE_WIDTH, BOARD_HALF_RANGE } from '@/server/utils/towerStackEngine'

const LOCK_TTL_MS = 10_000
const SESSION_TTL_SECONDS = 1800 // 30 min — generous for a long human run, bounds the "solve offline then wait" window

function lockKey(userId) { return `towerstack:lock:${userId}` }
function sessionKey(userId) { return `towerstack:session:${userId}` }

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
    const gameConfig = await prisma.gameConfig.findUnique({ where: { gameName: 'TowerStack' } })
    const playsPerPeriod = gameConfig?.towerPlaysPerPeriod ?? 3

    // Physics constants, snapshotted into the session so admin edits mid-game can't desync
    // a live replay at /end.
    const cfg = {
      baseSpeed: gameConfig?.towerBaseSpeed ?? 90,
      speedGrowthPerLayer: gameConfig?.towerSpeedGrowthPerLayer ?? 0.03,
      maxSpeedMultiplier: gameConfig?.towerMaxSpeedMultiplier ?? 2.5,
      perfectEpsilon: gameConfig?.towerPerfectEpsilon ?? 4,
      maxLayers: gameConfig?.towerMaxLayers ?? 800,
      baseWidth: BASE_WIDTH,
      boardHalfRange: BOARD_HALF_RANGE
    }

    // Check play limit
    const boundary = getDailyBoundary()
    const playsToday = await prisma.towerStackPlay.count({
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

    // Per-session jitter seed — shared openly with the client (it must know it to render the
    // true motion), but fresh every game so a solved-once tap sequence can't be replayed
    // across sessions. See towerStackEngine.js header for the full threat-model note.
    const jitterSeed = crypto.randomUUID().replace(/-/g, '')

    await redis.set(sessionKey(userId), JSON.stringify({
      startTime: Date.now(),
      jitterSeed,
      cfg
    }), 'EX', SESSION_TTL_SECONDS)

    // Record the play (inside the lock to prevent TOCTOU)
    await prisma.towerStackPlay.create({ data: { userId } })

    return { config: cfg, jitterSeed }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
