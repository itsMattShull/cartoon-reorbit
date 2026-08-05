import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getDailyWindowStart } from '@/server/utils/centralTime'
import { sanitizeFruitSamuraiCfg, MAX_SESSION_SECONDS } from '@/server/utils/fruitSamuraiEngine'

const LOCK_TTL_MS = 10_000
const SESSION_SLACK_SECONDS = 300
const RATE_LIMIT_WINDOW_SEC = 60
const RATE_LIMIT_MAX = 20

function lockKey (userId) { return `fruitsamurai:lock:${userId}` }
// Exactly one session key per user, keyed only by userId. A per-session-id key would let free
// play run alongside a held ranked session, but it would also give every user an unbounded
// Redis keyspace — and under LRU eviction that evicts OTHER users' live ranked sessions, who
// then 409 at /end having already burned a play. The single key is also what keeps GETDEL
// viable as the one-shot primitive. Starting any run therefore abandons an in-flight one.
function sessionKey (userId) { return `fruitsamurai:session:${userId}` }

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // Like Flappy, this game has no daily block to fall back on — free play is unlimited — so
  // the per-user rate limit IS the ceiling on how much work one account can ask of the server.
  // The per-user lock below bounds concurrency to 1, not rate. Fails closed: serving this path
  // blind during a Redis outage is worse than a 503.
  try {
    const rlKey = `fruitsamurai:start-rl:${userId}`
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

  const casRelease = 'if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end'

  try {
    const gameConfig = await prisma.gameConfig.findUnique({
      where: { gameName: 'FruitSamurai' },
      select: {
        fruitSamuraiRankedPlaysPerPeriod: true,
        fruitSamuraiStartingLives: true,
        fruitSamuraiGravity: true,
        fruitSamuraiLaunchVyMin: true,
        fruitSamuraiLaunchVyMax: true,
        fruitSamuraiLaunchVxMax: true,
        fruitSamuraiGraceTicks: true,
        fruitSamuraiSpawnIntervalStart: true,
        fruitSamuraiSpawnIntervalMin: true,
        fruitSamuraiRampTicks: true,
        fruitSamuraiWaveTwoTicks: true,
        fruitSamuraiWaveThreeTicks: true,
        fruitSamuraiEscalationStart: true,
        fruitSamuraiEscalationTicks: true,
        fruitSamuraiSpeedStartPct: true,
        fruitSamuraiSpeedMaxPct: true,
        fruitSamuraiJitterTicks: true,
        fruitSamuraiPowerupInterval: true,
        fruitSamuraiPowerupChancePct: true,
        fruitSamuraiWeightPiggy: true,
        fruitSamuraiWeightHourglass: true,
        fruitSamuraiWeightDynamite: true,
        fruitSamuraiPowerupRadius: true,
        fruitSamuraiPowerupSpeedPct: true,
        fruitSamuraiPiggyMultiplier: true,
        fruitSamuraiPiggyTicks: true,
        fruitSamuraiHourglassScalePct: true,
        fruitSamuraiHourglassTicks: true,
        fruitSamuraiDynamiteFuseTicks: true,
        fruitSamuraiDynamiteMultiplier: true,
        fruitSamuraiDynamiteMaxTargets: true,
        fruitSamuraiJackChatterEnabled: true,
        fruitSamuraiJackChatterCooldown: true
      }
    })
    // The GameConfig row is created lazily (by the admin tab, or by the first settings save),
    // so every read must survive its absence. Nothing seeds it.
    const playsPerPeriod = gameConfig?.fruitSamuraiRankedPlaysPerPeriod ?? 3

    // Snapshotted into the session so an admin edit mid-game can't desync the replay at /end.
    // Sanitized on the way in and again on the way out.
    const cfg = sanitizeFruitSamuraiCfg({
      startingLives: gameConfig?.fruitSamuraiStartingLives,
      gravity: gameConfig?.fruitSamuraiGravity,
      launchVyMin: gameConfig?.fruitSamuraiLaunchVyMin,
      launchVyMax: gameConfig?.fruitSamuraiLaunchVyMax,
      launchVxMax: gameConfig?.fruitSamuraiLaunchVxMax,
      graceTicks: gameConfig?.fruitSamuraiGraceTicks,
      spawnIntervalStartTicks: gameConfig?.fruitSamuraiSpawnIntervalStart,
      spawnIntervalMinTicks: gameConfig?.fruitSamuraiSpawnIntervalMin,
      rampTicks: gameConfig?.fruitSamuraiRampTicks,
      waveTwoTicks: gameConfig?.fruitSamuraiWaveTwoTicks,
      waveThreeTicks: gameConfig?.fruitSamuraiWaveThreeTicks,
      escalationStartTicks: gameConfig?.fruitSamuraiEscalationStart,
      escalationTicks: gameConfig?.fruitSamuraiEscalationTicks,
      speedStartPct: gameConfig?.fruitSamuraiSpeedStartPct,
      speedMaxPct: gameConfig?.fruitSamuraiSpeedMaxPct,
      jitterTicks: gameConfig?.fruitSamuraiJitterTicks,
      powerupIntervalTicks: gameConfig?.fruitSamuraiPowerupInterval,
      powerupChancePercent: gameConfig?.fruitSamuraiPowerupChancePct,
      powerupWeightPiggy: gameConfig?.fruitSamuraiWeightPiggy,
      powerupWeightHourglass: gameConfig?.fruitSamuraiWeightHourglass,
      powerupWeightDynamite: gameConfig?.fruitSamuraiWeightDynamite,
      powerupRadius: gameConfig?.fruitSamuraiPowerupRadius,
      powerupSpeedPct: gameConfig?.fruitSamuraiPowerupSpeedPct,
      piggyMultiplier: gameConfig?.fruitSamuraiPiggyMultiplier,
      piggyTicks: gameConfig?.fruitSamuraiPiggyTicks,
      hourglassScalePercent: gameConfig?.fruitSamuraiHourglassScalePct,
      hourglassTicks: gameConfig?.fruitSamuraiHourglassTicks,
      dynamiteFuseTicks: gameConfig?.fruitSamuraiDynamiteFuseTicks,
      dynamiteMultiplier: gameConfig?.fruitSamuraiDynamiteMultiplier,
      dynamiteMaxTargets: gameConfig?.fruitSamuraiDynamiteMaxTargets
    })

    const boundary = getDailyWindowStart()
    const rankedPlaysToday = await prisma.fruitSamuraiPlay.count({
      where: { userId, ranked: true, createdAt: { gte: boundary } }
    })
    // Ranked is decided HERE, server-side, under the lock — never recomputed at /end and never
    // taken from the client. Once the allotment is spent the player keeps playing for fun.
    const ranked = rankedPlaysToday < playsPerPeriod

    // Per-session seed, shared openly with the client (it must know it to spawn the same fruit)
    // but fresh every game, so a solved stroke log can't be replayed across sessions. See the
    // threat-model note in server/utils/fruitSamuraiEngine.js.
    const runSeed = crypto.randomUUID().replace(/-/g, '')

    await redis.set(sessionKey(userId), JSON.stringify({
      startTime: Date.now(),
      runSeed,
      ranked,
      cfg
    }), 'EX', MAX_SESSION_SECONDS + SESSION_SLACK_SECONDS)

    // Written inside the lock, and at /start rather than /end — otherwise a player could open
    // N sessions and submit only their best one.
    await prisma.fruitSamuraiPlay.create({ data: { userId, ranked } })

    return {
      // Only what the client needs to SIMULATE and RENDER. The engine's rails (MAX_TICKS,
      // MAX_STROKES, MIN_REALTIME_RATIO, MAX_SESSION_SECONDS) are deliberately withheld: they
      // would tell a bot exactly where to stop and how long it may stall while solving.
      config: cfg,
      // Renderer-only. The simulation has no concept of time passing more slowly, so this is
      // handed over separately from `cfg` to keep that boundary obvious at the call site.
      hourglassScalePercent: cfg.hourglassScalePercent,
      chatter: {
        enabled: gameConfig?.fruitSamuraiJackChatterEnabled ?? true,
        cooldownTicks: gameConfig?.fruitSamuraiJackChatterCooldown ?? 420
      },
      runSeed,
      ranked,
      playsLeft: Math.max(0, playsPerPeriod - rankedPlaysToday - (ranked ? 1 : 0))
    }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
