import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getDailyWindowStart } from '@/server/utils/centralTime'
import { sanitizeFlappyCfg } from '@/server/utils/flappyPowerpuffEngine'

const LOCK_TTL_MS = 10_000
const SESSION_SLACK_SECONDS = 300
const RATE_LIMIT_WINDOW_SEC = 60
const RATE_LIMIT_MAX = 20

function lockKey(userId) { return `flappy:lock:${userId}` }
// Exactly one session key per user, keyed only by userId. A per-session-id key would let free
// play run alongside a held ranked session, but it would also give every user an unbounded
// Redis keyspace — and under LRU eviction that evicts OTHER users' live ranked sessions, who
// then 409 at /end having already burned a play. The single key is also what keeps GETDEL
// viable as the one-shot primitive. Starting any run therefore abandons an in-flight one.
function sessionKey(userId) { return `flappy:session:${userId}` }

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // Unlike every other game here, Flappy has no daily block to fall back on — free play is
  // unlimited — so the per-user rate limit IS the ceiling on how much work one account can
  // ask of the server. The per-user lock below bounds concurrency to 1, not rate. Fails
  // closed: this path is expensive enough that serving it blind on a Redis outage is worse
  // than a 503.
  try {
    const rlKey = `flappy:start-rl:${userId}`
    const hits = await redis.incr(rlKey)
    if (hits === 1) await redis.expire(rlKey, RATE_LIMIT_WINDOW_SEC)
    if (hits > RATE_LIMIT_MAX) {
      throw createError({ statusCode: 429, statusMessage: 'Slow down a moment before starting another game.' })
    }
  } catch (err) {
    if (err?.statusCode) throw err
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable' })
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { banned: true } })
  if (user?.banned) throw createError({ statusCode: 403, statusMessage: 'Account suspended' })

  // Per-user lock so two concurrent /start requests can't both read the same play count and
  // both decide they're ranked.
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
    const gameConfig = await prisma.gameConfig.findUnique({
      where: { gameName: 'FlappyPowerpuff' },
      select: {
        flappyPlaysPerPeriod: true,
        flappyGravity: true,
        flappyFlapVelocity: true,
        flappyScrollSpeed: true,
        flappyPipeGap: true,
        flappyPipeSpacing: true,
        flappySpeedGrowthPerPipe: true,
        flappyMaxSpeedMultiplier: true,
        flappyMaxScore: true,
        flappyMaxSessionSeconds: true
      }
    })
    // The GameConfig row is created lazily (by the admin tab, or by the first settings save),
    // so every read must survive its absence. Nothing seeds it.
    const playsPerPeriod = gameConfig?.flappyPlaysPerPeriod ?? 3

    // Physics snapshotted into the session so an admin edit mid-game can't desync the replay
    // at /end. Sanitized on the way in and again on the way out.
    const cfg = sanitizeFlappyCfg({
      gravity: gameConfig?.flappyGravity,
      flapVelocity: gameConfig?.flappyFlapVelocity,
      scrollSpeed: gameConfig?.flappyScrollSpeed,
      pipeGap: gameConfig?.flappyPipeGap,
      pipeSpacing: gameConfig?.flappyPipeSpacing,
      speedGrowthPerPipe: gameConfig?.flappySpeedGrowthPerPipe,
      maxSpeedMultiplier: gameConfig?.flappyMaxSpeedMultiplier,
      maxScore: gameConfig?.flappyMaxScore,
      maxSessionSeconds: gameConfig?.flappyMaxSessionSeconds
    })

    const boundary = getDailyWindowStart()
    const rankedPlaysToday = await prisma.flappyPowerpuffPlay.count({
      where: { userId, ranked: true, createdAt: { gte: boundary } }
    })
    // Ranked is decided HERE, server-side, under the lock — never recomputed at /end and never
    // taken from the client. Once the allotment is spent the player keeps playing for fun.
    const ranked = rankedPlaysToday < playsPerPeriod

    // Per-session seed, shared openly with the client (it must know it to render the real
    // buildings) but fresh every game, so a solved flap sequence can't be replayed across
    // sessions. See flappyPowerpuffEngine.js for the full threat-model note.
    const pipeSeed = crypto.randomUUID().replace(/-/g, '')

    await redis.set(sessionKey(userId), JSON.stringify({
      startTime: Date.now(),
      pipeSeed,
      ranked,
      cfg
    }), 'EX', cfg.maxSessionSeconds + SESSION_SLACK_SECONDS)

    // Written inside the lock, and at /start rather than /end — otherwise a player could open
    // N sessions and submit only their best one.
    await prisma.flappyPowerpuffPlay.create({ data: { userId, ranked } })

    return {
      // Only what the client needs to RENDER. maxScore and maxSessionSeconds are deliberately
      // withheld: they'd tell a bot exactly where to stop so no threshold fires, and exactly
      // how long it may stall while solving.
      config: {
        gravity: cfg.gravity,
        flapVelocity: cfg.flapVelocity,
        scrollSpeed: cfg.scrollSpeed,
        pipeGap: cfg.pipeGap,
        pipeSpacing: cfg.pipeSpacing,
        speedGrowthPerPipe: cfg.speedGrowthPerPipe,
        maxSpeedMultiplier: cfg.maxSpeedMultiplier
      },
      pipeSeed,
      ranked,
      playsLeft: Math.max(0, playsPerPeriod - rankedPlaysToday - (ranked ? 1 : 0))
    }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
