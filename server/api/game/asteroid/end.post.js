import { defineEventHandler, readBody, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { replayAsteroidGame, MAX_INPUT_EVENTS } from '@/server/utils/asteroidEngine'
import { seedFromHex } from '@/lib/asteroidSim'
import { COMBAT_POOL_GAME_NAMES } from '@/server/utils/gamePoints'

const LOCK_TTL_MS = 20_000

// An input-log entry is {t,a} — two small integers, roughly 20 bytes serialized. A full
// MAX_INPUT_EVENTS log is therefore ~240 KB; this guard rejects oversized bodies before
// readBody parses them, with headroom so a legitimate maximum-length run is never refused.
const MAX_BODY_BYTES = 512 * 1024

function lockKey(userId)    { return `asteroid:lock:${userId}` }
function sessionKey(userId) { return `asteroid:session:${userId}` }

function getDailyBoundary() {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let b = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < b) b = b.minus({ days: 1 })
  return b.toUTC().toJSDate()
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const contentLength = Number(event.node.req.headers['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }

  const body = await readBody(event)
  if (!Array.isArray(body?.inputLog)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }
  // Cheap length gate before the lock, so a garbage payload never even reaches the replay.
  if (body.inputLog.length > MAX_INPUT_EVENTS) {
    throw createError({ statusCode: 400, statusMessage: 'Input log exceeds maximum' })
  }

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
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { banned: true } })
    if (user?.banned) throw createError({ statusCode: 403, statusMessage: 'Account suspended' })

    // Atomically consume the session. A given /start can be cashed in exactly once, so the same
    // input log can never be submitted twice.
    const raw = await redis.getdel(sessionKey(userId))
    if (!raw) throw createError({ statusCode: 409, statusMessage: 'Game session not found or expired. Start a new game.' })

    const session = JSON.parse(raw)
    const { startTime, runSeed, cfg, ranked } = session
    const elapsedMs = Date.now() - startTime

    // Authoritative replay. The client's own score is never read from the body.
    let result
    try {
      result = replayAsteroidGame({
        seedInt: seedFromHex(runSeed),
        cfg,
        inputLog: body.inputLog,
        elapsedMs
      })
    } catch (err) {
      throw createError({ statusCode: 400, statusMessage: `Invalid run: ${err.message}` })
    }

    const score = result.score

    // Practice runs record nothing and pay nothing — that is the whole deal with unlimited plays.
    if (!ranked) {
      return { score, wave: result.wave, ranked: false, pointsAwarded: 0 }
    }

    const gameConfig = await prisma.gameConfig.findUnique({
      where: { gameName: 'OperationAsteroid' },
      select: { asteroidPointsPerGame: true }
    })
    const basePointsPerGame = gameConfig?.asteroidPointsPerGame ?? 50

    const globalConfig = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true }
    })
    const dailyLimit = globalConfig?.dailyPointLimit ?? 100
    const pointsPerGame = Math.min(basePointsPerGame, dailyLimit)

    const boundary = getDailyBoundary()
    let pointsAwarded = 0

    if (pointsPerGame > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          // Advisory lock on the user so two award paths racing on the same daily pool can't
          // both read a stale "used" total and jointly exceed the cap. (Tower Stack's copy of
          // this transaction omits the lock; this one follows server/utils/gamePoints.js.)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

          const agg = await tx.gamePointLog.aggregate({
            where: {
              userId,
              createdAt: { gte: boundary },
              OR: [{ gameName: null }, { gameName: { notIn: COMBAT_POOL_GAME_NAMES } }]
            },
            _sum: { points: true }
          })
          const usedToday = Number(agg._sum?.points || 0)
          const toGive = Math.min(pointsPerGame, Math.max(0, dailyLimit - usedToday))
          pointsAwarded = toGive

          if (toGive > 0) {
            await tx.gamePointLog.create({ data: { userId, points: toGive, gameName: 'OperationAsteroid' } })
            const updated = await tx.userPoints.upsert({
              where: { userId },
              create: { userId, points: toGive },
              update: { points: { increment: toGive } }
            })
            await tx.pointsLog.create({
              data: {
                userId, direction: 'increase', points: toGive,
                total: updated.points, method: 'Game - Operation A.S.T.E.R.O.I.D.'
              }
            })
          }
        })
      } catch {
        // A points failure must not cost the player their score.
        pointsAwarded = 0
      }
    }

    await prisma.asteroidScore.create({
      data: { userId, score, wave: result.wave, ticks: result.ticks }
    })

    return { score, wave: result.wave, ranked: true, pointsAwarded }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
