import { defineEventHandler, readBody, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { replayGame, MIN_MOVE_INTERVAL_MS, BASE_MATCH_POINTS, DEFAULT_COMBO_WINDOW_MS } from '@/server/utils/reorbitMatchEngine'

const LOCK_TTL_MS = 15_000
const MAX_BODY_BYTES = 256 * 1024 // 256 KB
const MAX_MOVES_PER_SECOND = 10   // 1 move per 100ms max
const MAX_MOVES = 5000            // absolute cap on replayed moves (DoS guard)

function lockKey(userId) { return `reorbitmatch:lock:${userId}` }
function sessionKey(userId) { return `reorbitmatch:session:${userId}` }

function getDailyBoundary() {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let b = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < b) b = b.minus({ days: 1 })
  return b.toUTC().toJSDate()
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // Body size guard before full parse
  const contentLength = Number(event.node.req.headers['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }

  const body = await readBody(event)
  if (!Array.isArray(body?.moveLog)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  const { moveLog } = body

  // Absolute move-count cap, independent of session TTL, before any expensive work.
  if (moveLog.length > MAX_MOVES) {
    throw createError({ statusCode: 400, statusMessage: 'Move log exceeds maximum' })
  }

  // Per-user lock (same key as /start — serializes with concurrent start requests too)
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
    // Banned check
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { banned: true } })
    if (user?.banned) throw createError({ statusCode: 403, statusMessage: 'Account suspended' })

    // Atomically consume session — prevents replay attack
    const raw = await redis.getdel(sessionKey(userId))
    if (!raw) throw createError({ statusCode: 409, statusMessage: 'Game session not found or expired. Start a new game.' })

    const session = JSON.parse(raw)
    const { board, startTime, gridSize, emojiCount, fillSeed } = session
    const comboWindowMs = session.comboWindowMs ?? DEFAULT_COMBO_WINDOW_MS
    const endTime = Date.now()
    const elapsedMs = endTime - startTime

    // Validate move log length
    const maxTheoreticalMoves = Math.ceil(elapsedMs / MIN_MOVE_INTERVAL_MS) + 10
    if (moveLog.length > maxTheoreticalMoves) {
      throw createError({ statusCode: 400, statusMessage: 'Move log exceeds theoretical maximum' })
    }

    // Validate move timestamps
    if (moveLog.length > 0) {
      const firstTs = moveLog[0].ts
      const lastTs = moveLog[moveLog.length - 1].ts

      if (typeof firstTs !== 'number' || typeof lastTs !== 'number') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid move timestamps' })
      }
      if (lastTs - firstTs > elapsedMs + 1000) {
        throw createError({ statusCode: 400, statusMessage: 'Move timestamps exceed elapsed time' })
      }

      // Check monotonicity and min interval
      for (let i = 1; i < moveLog.length; i++) {
        const prev = moveLog[i - 1]
        const curr = moveLog[i]
        if (typeof curr.ts !== 'number' || curr.ts < prev.ts) {
          throw createError({ statusCode: 400, statusMessage: 'Move timestamps must be monotonically increasing' })
        }
        if (curr.ts - prev.ts < MIN_MOVE_INTERVAL_MS) {
          throw createError({ statusCode: 400, statusMessage: 'Moves submitted too fast' })
        }
      }
    }

    // Server-side replay (score computed here, NOT from client)
    let computedScore
    try {
      computedScore = replayGame(board, moveLog, gridSize, emojiCount, fillSeed, comboWindowMs)
    } catch (err) {
      throw createError({ statusCode: 400, statusMessage: `Invalid move sequence: ${err.message}` })
    }

    // Sanity-check: the combo streak is the multiplier, so the tightest possible ceiling is
    // an unbroken combo (1x + 2x + … + Nx) = N(N+1)/2 matches at base points. Defense-in-depth.
    const n = moveLog.length
    const theoreticalMax = BASE_MATCH_POINTS * (n * (n + 1) / 2)
    computedScore = Math.min(computedScore, theoreticalMax)

    // Load config for points-per-game
    const config = await prisma.gameConfig.findUnique({
      where: { gameName: 'ReOrbitMatch' },
      select: { reorbitPointsPerGame: true }
    })
    const basePointsPerGame = config?.reorbitPointsPerGame ?? 50

    // Sanity-check pointsPerGame against daily limit
    const globalConfig = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true }
    })
    const dailyLimit = globalConfig?.dailyPointLimit ?? 100
    const pointsPerGame = Math.min(basePointsPerGame, dailyLimit)

    // Award points within daily cap (same Prisma transaction pattern as Winball)
    const boundary = getDailyBoundary()
    let pointsAwarded = 0

    if (pointsPerGame > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          const agg = await tx.gamePointLog.aggregate({
            where: { userId, createdAt: { gte: boundary }, OR: [{ gameName: null }, { gameName: { not: 'TKO' } }] },
            _sum: { points: true }
          })
          const usedToday = Number(agg._sum?.points || 0)
          const toGive = Math.min(pointsPerGame, Math.max(0, dailyLimit - usedToday))
          pointsAwarded = toGive

          if (toGive > 0) {
            await tx.gamePointLog.create({ data: { userId, points: toGive, gameName: 'ReOrbitMatch' } })
            const updated = await tx.userPoints.upsert({
              where: { userId },
              create: { userId, points: toGive },
              update: { points: { increment: toGive } }
            })
            await tx.pointsLog.create({
              data: { userId, direction: 'increase', points: toGive, total: updated.points, method: 'Game - ReOrbit Match' }
            })
          }
        })
      } catch {
        // Points award failure is non-fatal — score is still recorded
      }
    }

    // Save score record
    await prisma.reOrbitMatchScore.create({ data: { userId, score: computedScore } })

    return { score: computedScore, pointsAwarded }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
