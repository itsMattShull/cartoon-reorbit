import { defineEventHandler, readBody, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { replayTowerGame, hasRoboticCadence, TOWER_MIN_MOVE_INTERVAL_MS, MAX_LAYERS_HARD_CAP } from '@/server/utils/towerStackEngine'
import { COMBAT_POOL_GAME_NAMES } from '@/server/utils/gamePoints'

const LOCK_TTL_MS = 15_000
const MAX_BODY_BYTES = 64 * 1024 // 64 KB — a moveLog entry is just { ts }, far smaller than ReOrbit's cell arrays

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
  if (moveLog.length > MAX_LAYERS_HARD_CAP) {
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
    const { startTime, jitterSeed, cfg } = session
    const endTime = Date.now()
    const elapsedMs = endTime - startTime

    // Layer count can never exceed what the snapshotted config allows for this session.
    if (moveLog.length > (cfg.maxLayers ?? MAX_LAYERS_HARD_CAP)) {
      throw createError({ statusCode: 400, statusMessage: 'Move log exceeds session layer limit' })
    }

    // Validate move timestamps up front (engine re-validates monotonicity/pacing during
    // replay too, but checking the log's span against wall-clock elapsed time here catches
    // logs that don't even internally match how long the session has been open).
    if (moveLog.length > 0) {
      const firstTs = moveLog[0].ts
      const lastTs = moveLog[moveLog.length - 1].ts

      if (typeof firstTs !== 'number' || typeof lastTs !== 'number') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid move timestamps' })
      }
      if (lastTs - firstTs > elapsedMs + 1000) {
        throw createError({ statusCode: 400, statusMessage: 'Move timestamps exceed elapsed time' })
      }

      const maxTheoreticalMoves = Math.ceil(elapsedMs / TOWER_MIN_MOVE_INTERVAL_MS) + 10
      if (moveLog.length > maxTheoreticalMoves) {
        throw createError({ statusCode: 400, statusMessage: 'Move log exceeds theoretical maximum' })
      }

      // Anomaly check: reject suspiciously uniform (robotic) tap cadence. Defense-in-depth,
      // not a substitute for the timing checks above — see towerStackEngine.js header.
      if (hasRoboticCadence(moveLog)) {
        throw createError({ statusCode: 400, statusMessage: 'Move timing rejected' })
      }
    }

    // Server-side replay (score computed here, NOT from client)
    let computedScore
    try {
      computedScore = replayTowerGame(moveLog, jitterSeed, cfg)
    } catch (err) {
      throw createError({ statusCode: 400, statusMessage: `Invalid move sequence: ${err.message}` })
    }

    // Defense-in-depth: score can never exceed the number of submitted moves.
    computedScore = Math.min(computedScore, moveLog.length)

    // Load config for points-per-game
    const gameConfig = await prisma.gameConfig.findUnique({
      where: { gameName: 'TowerStack' },
      select: { towerPointsPerGame: true }
    })
    const basePointsPerGame = gameConfig?.towerPointsPerGame ?? 50

    // Sanity-check pointsPerGame against daily limit
    const globalConfig = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true }
    })
    const dailyLimit = globalConfig?.dailyPointLimit ?? 100
    const pointsPerGame = Math.min(basePointsPerGame, dailyLimit)

    // Award points within daily cap (same Prisma transaction pattern as ReOrbit Match)
    const boundary = getDailyBoundary()
    let pointsAwarded = 0

    if (pointsPerGame > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          const agg = await tx.gamePointLog.aggregate({
            where: { userId, createdAt: { gte: boundary }, OR: [{ gameName: null }, { gameName: { notIn: COMBAT_POOL_GAME_NAMES } }] },
            _sum: { points: true }
          })
          const usedToday = Number(agg._sum?.points || 0)
          const toGive = Math.min(pointsPerGame, Math.max(0, dailyLimit - usedToday))
          pointsAwarded = toGive

          if (toGive > 0) {
            await tx.gamePointLog.create({ data: { userId, points: toGive, gameName: 'TowerStack' } })
            const updated = await tx.userPoints.upsert({
              where: { userId },
              create: { userId, points: toGive },
              update: { points: { increment: toGive } }
            })
            await tx.pointsLog.create({
              data: { userId, direction: 'increase', points: toGive, total: updated.points, method: 'Game - Tower Stack' }
            })
          }
        })
      } catch {
        // Points award failure is non-fatal — score is still recorded
      }
    }

    // Save score record
    await prisma.towerStackScore.create({ data: { userId, score: computedScore } })

    return { score: computedScore, pointsAwarded }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
