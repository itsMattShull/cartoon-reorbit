import { defineEventHandler, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { MIN_FLIP_INTERVAL_MS } from '@/server/utils/reorbitMemoryEngine'
import { COMBAT_POOL_GAME_NAMES } from '@/server/utils/gamePoints'

const LOCK_TTL_MS = 15_000

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

    // Atomically consume session — prevents replay / double-claim
    const raw = await redis.getdel(sessionKey(userId))
    if (!raw) throw createError({ statusCode: 409, statusMessage: 'Game session not found or expired. Start a new game.' })

    const session = JSON.parse(raw)
    const { pairs, matched, moves, startedAt } = session
    const completed = Array.isArray(matched) && matched.length === pairs * 2 && matched.every(m => m === 1)

    // Only a fully-matched board yields a leaderboard score / points. Ending early (tab
    // closed, "give up", time ran out) just discards the session — moves is authoritative
    // and server-tracked either way, but an incomplete game must never be scoreable, or
    // calling /end at move 0 would be the best possible "score" on the board.
    if (!completed) {
      return { completed: false, moves, pointsAwarded: 0 }
    }

    const elapsedMs = Date.now() - startedAt
    // Defense-in-depth: the per-flip minimum interval is already enforced atomically inside
    // the flip script, but re-derive a wall-clock floor here too, mirroring the other games'
    // belt-and-suspenders timestamp checks at /end.
    const minPossibleMs = Math.max(0, moves * 2 - 1) * MIN_FLIP_INTERVAL_MS
    if (elapsedMs < minPossibleMs) {
      throw createError({ statusCode: 400, statusMessage: 'Move pacing exceeds theoretical maximum' })
    }

    // Load config for points-per-game
    const config = await prisma.gameConfig.findUnique({
      where: { gameName: 'ReOrbitMemory' },
      select: { reorbitMemoryPointsPerGame: true }
    })
    const basePointsPerGame = config?.reorbitMemoryPointsPerGame ?? 50

    // Sanity-check pointsPerGame against daily limit
    const globalConfig = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true }
    })
    const dailyLimit = globalConfig?.dailyPointLimit ?? 100
    const pointsPerGame = Math.min(basePointsPerGame, dailyLimit)

    // Award points within daily cap (same shared pattern as every other game)
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
            await tx.gamePointLog.create({ data: { userId, points: toGive, gameName: 'ReOrbitMemory' } })
            const updated = await tx.userPoints.upsert({
              where: { userId },
              create: { userId, points: toGive },
              update: { points: { increment: toGive } }
            })
            await tx.pointsLog.create({
              data: { userId, direction: 'increase', points: toGive, total: updated.points, method: 'Game - ReOrbit Memory' }
            })
          }
        })
      } catch {
        // Points award failure is non-fatal — score is still recorded
      }
    }

    // Save score record (moves — lower is better)
    await prisma.reOrbitMemoryScore.create({ data: { userId, moves } })

    return { completed: true, moves, pointsAwarded }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
