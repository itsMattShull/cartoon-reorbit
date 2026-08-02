import { defineEventHandler, readBody, createError } from 'h3'
import { DateTime } from 'luxon'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { MAX_TICKS } from '@/server/utils/asteroidEngine'
import { normalizeConfig, SHIP_IDS, DEFAULT_SHIP_ID, getShip } from '@/lib/asteroidSim'

const LOCK_TTL_MS = 10_000

// The run itself is capped at 5 minutes of simulated time; the session gets a much longer TTL
// so a player who pauses, backgrounds the tab, or takes a phone call mid-run can still submit.
// It still bounds the "solve offline, submit later" window.
const SESSION_TTL_SECONDS = 1800

// Plays are UNLIMITED by design, which means /start is the one game endpoint in this app
// without a natural ceiling. This hourly cap keeps that from becoming a way to churn Redis
// writes indefinitely, while sitting far above what anyone can actually play in an hour
// (a full run is 5 minutes, so a human tops out near 12).
const STARTS_PER_HOUR = 60

function lockKey(userId)    { return `asteroid:lock:${userId}` }
function sessionKey(userId) { return `asteroid:session:${userId}` }
function rateKey(userId)    { return `asteroid:starts:${userId}` }

function getDailyBoundary() {
  const chicagoNow = DateTime.now().setZone('America/Chicago')
  let b = chicagoNow.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
  if (chicagoNow < b) b = b.minus({ days: 1 })
  return b.toUTC().toJSDate()
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { banned: true } })
  if (user?.banned) throw createError({ statusCode: 403, statusMessage: 'Account suspended' })

  // Which ship is flying. Validated against the known list so a forged id cannot smuggle in a
  // made-up weapon — anything unrecognised is rejected outright rather than silently defaulted,
  // so a client bug surfaces instead of quietly giving the player the wrong ship.
  const body = await readBody(event).catch(() => null)
  const requestedShip = body?.shipId
  let shipId = DEFAULT_SHIP_ID
  if (requestedShip != null) {
    if (typeof requestedShip !== 'string' || !SHIP_IDS.includes(requestedShip)) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown ship' })
    }
    shipId = requestedShip
  }

  // Per-user lock prevents concurrent /start requests from both reading the same ranked-play
  // count and each claiming the last ranked slot (TOCTOU).
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
    // Sliding hourly start budget.
    try {
      const starts = await redis.incr(rateKey(userId))
      if (starts === 1) await redis.expire(rateKey(userId), 3600)
      if (starts > STARTS_PER_HOUR) {
        throw createError({ statusCode: 429, statusMessage: 'Too many games started. Try again shortly.' })
      }
    } catch (err) {
      if (err?.statusCode) throw err
      // Redis counter unavailable — the per-user lock still serializes, so fail open here.
    }

    const gameConfig = await prisma.gameConfig.findUnique({ where: { gameName: 'OperationAsteroid' } })
    const rankedPlaysPerPeriod = gameConfig?.asteroidRankedPlaysPerPeriod ?? 3

    // Per-ship weapon columns, falling back to the ship's built-in profile when no config row
    // exists yet. normalizeConfig clamps all of it immediately below.
    const shipDefaults = getShip(shipId).weapon
    const WEAPON_COLUMNS = {
      mosquittoh: ['asteroidMosqFireInterval', 'asteroidMosqBulletSpeed', 'asteroidMosqBulletLife', 'asteroidMosqPellets', 'asteroidMosqSpread'],
      scamper:    ['asteroidScamFireInterval', 'asteroidScamBulletSpeed', 'asteroidScamBulletLife', 'asteroidScamPellets', 'asteroidScamSpread'],
      casual:     ['asteroidCasFireInterval',  'asteroidCasBulletSpeed',  'asteroidCasBulletLife',  'asteroidCasPellets',  'asteroidCasSpread']
    }
    const [colInterval, colSpeed, colLife, colPellets, colSpread] = WEAPON_COLUMNS[shipId]
    const weapon = {
      fireIntervalTicks: gameConfig?.[colInterval] ?? shipDefaults.fireIntervalTicks,
      bulletSpeed:       gameConfig?.[colSpeed]    ?? shipDefaults.bulletSpeed,
      bulletLifeTicks:   gameConfig?.[colLife]     ?? shipDefaults.bulletLifeTicks,
      pellets:           gameConfig?.[colPellets]  ?? shipDefaults.pellets,
      spreadSteps:       gameConfig?.[colSpread]   ?? shipDefaults.spreadSteps,
      // Not an admin column: where the muzzle sits is a property of the ship's ARTWORK, not a
      // balance dial, so it comes straight from the ship profile.
      muzzleRadii:       shipDefaults.muzzleRadii
    }

    // Snapshot the tuning into the session so an admin edit mid-run can't desync the replay.
    // normalizeConfig clamps every value into a range the simulation is known to be stable in,
    // and is applied identically on the client, so both sides build the same world.
    const cfg = normalizeConfig({
      startingLives:        gameConfig?.asteroidStartingLives,
      startAsteroids:       gameConfig?.asteroidStartAsteroids,
      asteroidsPerWave:     gameConfig?.asteroidAsteroidsPerWave,
      asteroidSpeed:        gameConfig?.asteroidAsteroidSpeed,
      waveSpeedGrowth:      gameConfig?.asteroidWaveSpeedGrowth,
      maxSpeedMultiplier:   gameConfig?.asteroidMaxSpeedMultiplier,
      turnRate:             gameConfig?.asteroidTurnRate,
      thrustAccel:          gameConfig?.asteroidThrustAccel,
      maxShipSpeed:         gameConfig?.asteroidMaxShipSpeed,
      shipDrag:             gameConfig?.asteroidShipDrag,
      extraLifeScore:       gameConfig?.asteroidExtraLifeScore,
      shipRadius:           gameConfig?.asteroidShipRadius,
      // Weapon comes from the CHOSEN ship, not from a global setting. The simulation only ever
      // sees these five flat fields, so it stays identical no matter which ship is flying.
      ...weapon,
      respawnInvulnTicks:   gameConfig?.asteroidRespawnInvulnTicks,
      powerupRadius:        gameConfig?.asteroidPowerupRadius,
      powerupLifeTicks:     gameConfig?.asteroidPowerupLifeTicks,
      asteroidLargeRadius:  gameConfig?.asteroidLargeRadius,
      asteroidMediumRadius: gameConfig?.asteroidMediumRadius,
      asteroidSmallRadius:  gameConfig?.asteroidSmallRadius,
      pointsLarge:          gameConfig?.asteroidPointsLarge,
      pointsMedium:         gameConfig?.asteroidPointsMedium,
      pointsSmall:          gameConfig?.asteroidPointsSmall,
      waveClearBonus:       gameConfig?.asteroidWaveClearBonus,
      powerupsEnabled:      gameConfig?.asteroidPowerupsEnabled ?? true,
      powerupBlueEnabled:   gameConfig?.asteroidPowerupBlueEnabled ?? true,
      powerupRedEnabled:    gameConfig?.asteroidPowerupRedEnabled ?? true,
      powerupGreenEnabled:  gameConfig?.asteroidPowerupGreenEnabled ?? true,
      powerupIntervalTicks: gameConfig?.asteroidPowerupIntervalTicks,
      powerupChancePercent: gameConfig?.asteroidPowerupChancePercent,
      powerupBlueTicks:     gameConfig?.asteroidPowerupBlueTicks,
      powerupRedTicks:      gameConfig?.asteroidPowerupRedTicks,
      powerupGreenTicks:    gameConfig?.asteroidPowerupGreenTicks
    })

    // Ranked or practice? Plays are unlimited, so a full daily allotment never blocks the game —
    // it only stops the run from counting.
    const boundary = getDailyBoundary()
    const rankedPlaysToday = await prisma.asteroidPlay.count({
      where: { userId, createdAt: { gte: boundary } }
    })
    const ranked = rankedPlaysToday < rankedPlaysPerPeriod

    // Fresh per-session world seed. The client needs it to render the same asteroids the server
    // will replay, so it is not a secret — its job is to make each session's world unique, so a
    // once-solved input log can't be replayed against a different game.
    const runSeed = crypto.randomUUID().replace(/-/g, '')

    await redis.set(sessionKey(userId), JSON.stringify({
      startTime: Date.now(),
      runSeed,
      cfg,
      ranked,
      shipId
    }), 'EX', SESSION_TTL_SECONDS)

    // Consume the ranked slot inside the lock.
    if (ranked) await prisma.asteroidPlay.create({ data: { userId } })

    const nextReset = new Date(boundary.getTime() + 24 * 60 * 60 * 1000)

    return {
      config: cfg,
      runSeed,
      ranked,
      shipId,
      maxTicks: MAX_TICKS,
      rankedPlaysLeft: Math.max(0, rankedPlaysPerPeriod - rankedPlaysToday - (ranked ? 1 : 0)),
      playsResetAt: nextReset.toISOString()
    }
  } finally {
    try { await redis.eval(casRelease, 1, lockKey(userId), lockToken) } catch {}
  }
})
