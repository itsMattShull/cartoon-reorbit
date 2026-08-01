import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getDailyWindowStart } from '@/server/utils/centralTime'
import { awardGeneralPoolGamePoints } from '@/server/utils/gamePoints'
import {
  replayFlappyGame,
  hasSolverClustering,
  sanitizeFlappyCfg,
  FLAPPY_MIN_FLAP_INTERVAL_MS,
  MAX_FLAPS_HARD_CAP
} from '@/server/utils/flappyPowerpuffEngine'

const LOCK_TTL_MS = 15_000
// The flap log is a bare array of integer ms — ~6 bytes per entry rather than the ~14 an
// object-per-flap costs — so MAX_FLAPS_HARD_CAP entries fit comfortably inside this.
const MAX_BODY_BYTES = 64 * 1024
const RATE_LIMIT_WINDOW_SEC = 60
const RATE_LIMIT_MAX = 20
const CHARACTERS = new Set(['blossom', 'bubbles', 'buttercup'])

function lockKey(userId) { return `flappy:lock:${userId}` }
function sessionKey(userId) { return `flappy:session:${userId}` }

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // Free play is unlimited, so this is the only ceiling on replay work per account.
  try {
    const rlKey = `flappy:end-rl:${userId}`
    const hits = await redis.incr(rlKey)
    if (hits === 1) await redis.expire(rlKey, RATE_LIMIT_WINDOW_SEC)
    if (hits > RATE_LIMIT_MAX) {
      throw createError({ statusCode: 429, statusMessage: 'Too many submissions. Try again shortly.' })
    }
  } catch (err) {
    if (err?.statusCode) throw err
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }

  // Advisory only: content-length is absent on a chunked request, so the real bound is the
  // post-parse length check below.
  const contentLength = Number(event.node.req.headers['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }

  const body = await readBody(event)
  if (!Array.isArray(body?.flapLog)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }
  const flapLog = body.flapLog
  if (flapLog.length > MAX_FLAPS_HARD_CAP) {
    throw createError({ statusCode: 400, statusMessage: 'Flap log exceeds maximum' })
  }
  const character = typeof body.character === 'string' ? body.character : ''
  if (!CHARACTERS.has(character)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid character' })
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
    // Atomic consume — this, not the lock, is what makes a double /end impossible (the lock's
    // PX can expire mid-request). Keep it as one GETDEL; do not split into GET then DEL.
    const raw = await redis.getdel(sessionKey(userId))
    if (!raw) throw createError({ statusCode: 409, statusMessage: 'Game session not found or expired. Start a new game.' })

    const session = JSON.parse(raw)
    const ranked = session.ranked === true // strict: never recompute from the play count
    const cfg = sanitizeFlappyCfg(session.cfg) // the session blob is no more trusted than the row it came from

    // Unranked runs award nothing, store nothing and never reach the leaderboard, so there is
    // nothing here worth verifying — replaying them would be pure waste on the one path that
    // has no daily cap. Bail before the replay and before any further DB work.
    if (!ranked) {
      return { score: null, ranked: false, pointsAwarded: 0 }
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { banned: true } })
    if (user?.banned) throw createError({ statusCode: 403, statusMessage: 'Account suspended' })

    const elapsedMs = Date.now() - session.startTime

    if (flapLog.length > 0) {
      const firstTs = flapLog[0]
      const lastTs = flapLog[flapLog.length - 1]
      if (typeof firstTs !== 'number' || typeof lastTs !== 'number') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid flap timestamps' })
      }
      // The client's timeline excludes paused time, so it can only ever be SHORTER than the
      // server's wall clock. The server never subtracts a client-reported pause from
      // elapsedMs — doing so would let a claimed pause buy real thinking time.
      if (lastTs - firstTs > elapsedMs + 1000) {
        throw createError({ statusCode: 400, statusMessage: 'Flap timestamps exceed elapsed time' })
      }
      const maxTheoretical = Math.ceil(elapsedMs / FLAPPY_MIN_FLAP_INTERVAL_MS) + 10
      if (flapLog.length > maxTheoretical) {
        throw createError({ statusCode: 400, statusMessage: 'Flap log exceeds theoretical maximum' })
      }
    }

    let result
    try {
      result = replayFlappyGame(flapLog, session.pipeSeed, cfg)
    } catch (err) {
      throw createError({ statusCode: 400, statusMessage: `Invalid flap sequence: ${err.message}` })
    }
    const score = result.score

    // Advisory anomaly signal, not a rejection: a solver clusters its gap crossings near one
    // offset while humans scatter widely, but a bot that adds scatter defeats it. Surfaced in
    // the logs for the admin cheat tooling rather than used to deny a score.
    if (hasSolverClustering(result)) {
      console.warn(
        `[flappy] solver-like gap clearance: user=${userId} score=${score} stddev=${result.gapClearanceStdDev?.toFixed(2)}`
      )
    }

    const [gameConfig, globalConfig] = await Promise.all([
      prisma.gameConfig.findUnique({
        where: { gameName: 'FlappyPowerpuff' },
        select: { flappyPointsPerGame: true }
      }),
      prisma.globalGameConfig.findUnique({
        where: { id: 'singleton' },
        select: { dailyPointLimit: true }
      })
    ])
    const dailyLimit = Math.max(0, globalConfig?.dailyPointLimit ?? 100)
    const pointsPerGame = Math.min(Math.max(0, gameConfig?.flappyPointsPerGame ?? 50), dailyLimit)

    let pointsAwarded = 0
    let pointsError = false
    if (pointsPerGame > 0) {
      try {
        pointsAwarded = await prisma.$transaction(async (tx) => awardGeneralPoolGamePoints(tx, {
          userId,
          gameName: 'FlappyPowerpuff',
          pointsPerGame,
          cap: dailyLimit,
          method: 'Game - Flappy Powerpuff'
        }))
      } catch (err) {
        // Non-fatal — the score is still recorded — but distinguish it from a genuine cap hit
        // so the client doesn't report "0 points" for what was actually a transient failure.
        pointsError = true
        console.error('[flappy] point award failed', err)
      }
    }

    await prisma.flappyPowerpuffScore.create({ data: { userId, score, character } })

    // Daily boundary is only needed for the client's "resets at" hint; the award path takes
    // its own window internally.
    const nextReset = new Date(getDailyWindowStart().getTime() + 24 * 60 * 60 * 1000)

    return {
      score,
      ranked: true,
      pointsAwarded,
      pointsError,
      playsResetAt: nextReset.toISOString()
    }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
