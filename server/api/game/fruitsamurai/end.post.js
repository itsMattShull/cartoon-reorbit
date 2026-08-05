import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getDailyWindowStart } from '@/server/utils/centralTime'
import { awardGeneralPoolGamePoints } from '@/server/utils/gamePoints'
import {
  replayFruitSamuraiGame,
  sanitizeFruitSamuraiCfg,
  MAX_STROKES
} from '@/server/utils/fruitSamuraiEngine'

const LOCK_TTL_MS = 15_000
// A maximal log (MAX_STROKES strokes near MAX_SAMPLES samples) measures ~133KB of JSON, so
// this leaves comfortable headroom without inviting a multi-megabyte body.
const MAX_BODY_BYTES = 512 * 1024
const RATE_LIMIT_WINDOW_SEC = 60
const RATE_LIMIT_MAX = 20

function lockKey (userId) { return `fruitsamurai:lock:${userId}` }
function sessionKey (userId) { return `fruitsamurai:session:${userId}` }

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // Free play is unlimited, so this is the only ceiling on replay work per account.
  try {
    const rlKey = `fruitsamurai:end-rl:${userId}`
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
  // stroke and sample caps the engine's sanitizer enforces after parsing.
  const contentLength = Number(event.node.req.headers['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }

  const body = await readBody(event)
  if (!Array.isArray(body?.strokes)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }
  const strokes = body.strokes
  if (strokes.length > MAX_STROKES) {
    throw createError({ statusCode: 400, statusMessage: 'Stroke log exceeds maximum' })
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

  const casRelease = 'if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end'

  try {
    // Atomic consume — this, not the lock, is what makes a double /end impossible (the lock's
    // PX can expire mid-request). Keep it as one GETDEL; do not split into GET then DEL.
    const raw = await redis.getdel(sessionKey(userId))
    if (!raw) {
      throw createError({ statusCode: 409, statusMessage: 'Game session not found or expired. Start a new game.' })
    }

    const session = JSON.parse(raw)
    const ranked = session.ranked === true // strict: never recompute from the play count
    const cfg = sanitizeFruitSamuraiCfg(session.cfg) // no more trusted than the row it came from

    // Unranked runs award nothing, store nothing and never reach the leaderboard, so there is
    // nothing here worth verifying — replaying them would be pure waste on the one path that
    // has no daily cap. Bail before the replay and before any further DB work.
    if (!ranked) {
      return { score: null, ranked: false, pointsAwarded: 0 }
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { banned: true } })
    if (user?.banned) throw createError({ statusCode: 403, statusMessage: 'Account suspended' })

    const elapsedMs = Date.now() - session.startTime

    let result
    try {
      result = replayFruitSamuraiGame({ runSeed: session.runSeed, cfg, strokes, elapsedMs })
    } catch (err) {
      throw createError({ statusCode: 400, statusMessage: `Invalid stroke log: ${err.message}` })
    }

    // The wall-clock gates. `tooFast` means the submitted run claims more simulated time than
    // has actually elapsed since /start — physically impossible for a real player, so it is a
    // hard reject rather than a flag. `tooSlow` catches a client pacing its own accumulator
    // down to buy planning time, which slow motion being a real mechanic here makes reachable;
    // see the note in fruitSamuraiEngine.js on why Asteroid does not need this half.
    if (result.tooFast) {
      throw createError({ statusCode: 400, statusMessage: 'Run submitted faster than it could have been played.' })
    }
    if (result.tooSlow) {
      throw createError({ statusCode: 400, statusMessage: 'Run took too long to complete.' })
    }

    const score = result.score

    const [gameConfig, globalConfig] = await Promise.all([
      prisma.gameConfig.findUnique({
        where: { gameName: 'FruitSamurai' },
        select: { fruitSamuraiPointsPerGame: true }
      }),
      prisma.globalGameConfig.findUnique({
        where: { id: 'singleton' },
        select: { dailyPointLimit: true }
      })
    ])
    const dailyLimit = Math.max(0, globalConfig?.dailyPointLimit ?? 100)
    // Flat per ranked play, exactly like Flappy: a perfect bot and a player who scores 30 earn
    // the same points, which is what keeps a forged score economically worthless.
    const pointsPerGame = Math.min(Math.max(0, gameConfig?.fruitSamuraiPointsPerGame ?? 50), dailyLimit)

    let pointsAwarded = 0
    let pointsError = false
    if (pointsPerGame > 0) {
      try {
        pointsAwarded = await prisma.$transaction(async (tx) => awardGeneralPoolGamePoints(tx, {
          userId,
          // Must NOT be added to COMBAT_POOL_GAME_NAMES: this is an arcade game and draws from
          // the general pool, which is defined by EXCLUSION of that list. Using
          // awardCappedGamePoints here instead would hand this game its own private daily cap.
          gameName: 'FruitSamurai',
          pointsPerGame,
          cap: dailyLimit,
          method: 'Game - Fruit Samurai'
        }))
      } catch (err) {
        // Non-fatal — the score is still recorded — but distinguish it from a genuine cap hit
        // so the client doesn't report "0 points" for what was actually a transient failure.
        pointsError = true
        console.error('[fruitsamurai] point award failed', err)
      }
    }

    await prisma.fruitSamuraiScore.create({ data: { userId, score, ticks: result.ticks } })

    // Daily boundary is only needed for the client's "resets at" hint; the award path takes its
    // own window internally.
    const nextReset = new Date(getDailyWindowStart().getTime() + 24 * 60 * 60 * 1000)

    return {
      score,
      ticks: result.ticks,
      slices: result.slices,
      misses: result.misses,
      booms: result.booms,
      ranked: true,
      pointsAwarded,
      pointsError,
      playsResetAt: nextReset.toISOString()
    }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
