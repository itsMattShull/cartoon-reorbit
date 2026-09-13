// server/api/game/winwheel/spin.post.js
import { prisma } from '@/server/prisma'
import { createError } from 'h3'
import { mintQueue } from '../../../utils/queues'
import { QueueEvents } from 'bullmq'
import { redis } from '@/server/utils/redis'
import { getChicagoMorningWindowStart } from '@/server/utils/dailyTaskWindows'

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

// Module-level singleton — avoids opening a new Redis pub/sub connection per request
let _queueEvents = null
function getQueueEvents() {
  if (!_queueEvents) {
    _queueEvents = new QueueEvents(mintQueue.name, { connection: redisConnection })
  }
  return _queueEvents
}

const LOCK_TTL_MS = 22_000 // slightly longer than mint job timeout
const MINT_JOB_TIMEOUT_MS = 20_000

function lockKey(userId) {
  return `winwheel:spin:lock:${userId}`
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // — Acquire per-user distributed lock to prevent concurrent spins —
  // Store a unique token so the release can verify ownership (CAS) and
  // avoid deleting a lock that was re-acquired by another request after TTL expiry.
  const lockToken = crypto.randomUUID()
  let lockAcquired = false
  try {
    const result = await redis.set(lockKey(userId), lockToken, 'NX', 'PX', LOCK_TTL_MS)
    lockAcquired = result === 'OK'
  } catch (redisErr) {
    // Redis unavailable — fail closed rather than silently proceeding without a lock
    throw createError({ statusCode: 503, statusMessage: 'Service temporarily unavailable, please try again.' })
  }

  if (!lockAcquired) {
    throw createError({ statusCode: 429, statusMessage: 'A spin is already in progress.' })
  }

  let spinLogId = null

  try {
    // — Load Winwheel config —
    const config = await prisma.gameConfig.findUnique({
      where: { gameName: 'Winwheel' },
      include: { exclusiveCtoons: { include: { ctoon: true } } }
    })
    if (!config) {
      throw createError({ statusCode: 500, statusMessage: 'Winwheel config not found' })
    }
    const { spinCost, pointsWon, maxDailySpins, exclusiveCtoons, tripleNothingCtoonId } = config
    const pool = exclusiveCtoons.map(o => o.ctoon)

    // — Enforce daily limit (8 AM CST → 8 AM CST) —
    const windowStart = getChicagoMorningWindowStart()
    const resetUtcMs = windowStart.getTime()

    // Count pending and completed spins — failed spins don't consume the daily slot.
    // 'tripleNothing' bonus-grant rows are excluded too: they're a reward layered on
    // top of an already-counted spin, not a spin of their own.
    const spinsToday = await prisma.wheelSpinLog.count({
      where: { userId, createdAt: { gte: windowStart }, status: { not: 'failed' }, result: { not: 'tripleNothing' } }
    })
    if (spinsToday >= maxDailySpins) {
      const nextReset = new Date(resetUtcMs + 24 * 60 * 60 * 1000)
      throw createError({
        statusCode: 429,
        statusMessage: 'Daily spin limit reached',
        data: { nextReset: nextReset.toISOString() }
      })
    }

    // — Determine prize before any DB writes so an empty pool doesn't waste a spin —
    const sliceCount = 6
    const sliceIndex = Math.floor(Math.random() * sliceCount)

    let result
    let prizePoints = 0
    let ctoonIdToMint = null

    switch (sliceIndex) {
      case 0:
      case 4:
        result = 'nothing'
        break

      case 1:
      case 3:
        result = 'points'
        prizePoints = pointsWon
        break

      case 2: {
        result = 'ctoonLeast'
        const commons = await prisma.ctoon.findMany({
          where: { inCmart: true, rarity: 'Common', releaseDate: { lt: new Date() } }
        })
        const withMints = await Promise.all(commons.map(async c => {
          const agg = await prisma.userCtoon.aggregate({
            where: { ctoonId: c.id },
            _max: { mintNumber: true }
          })
          return { ctoon: c, highestMint: agg._max.mintNumber || 0 }
        }))
        const finite = withMints.filter(({ ctoon, highestMint }) =>
          ctoon.quantity != null && highestMint < ctoon.quantity
        )
        if (finite.length > 0) {
          const minMint = Math.min(...finite.map(x => x.highestMint))
          const least  = finite.filter(x => x.highestMint === minMint)
          ctoonIdToMint = least[Math.floor(Math.random() * least.length)].ctoon.id
        } else {
          const unlimited = commons.filter(c => c.quantity == null)
          if (unlimited.length === 0) {
            throw createError({ statusCode: 500, statusMessage: 'No Common cToons available for least-desirable prize' })
          }
          ctoonIdToMint = unlimited[Math.floor(Math.random() * unlimited.length)].id
        }
        break
      }

      case 5:
        result = 'ctoonExclusive'
        // Validate pool before any writes — an empty pool should not consume a spin
        if (pool.length === 0) {
          throw createError({ statusCode: 500, statusMessage: 'No exclusive cToons configured for Winwheel' })
        }
        ctoonIdToMint = pool[Math.floor(Math.random() * pool.length)].id
        break
    }

    // — Deduct points, log the debit, and pre-claim the spin slot atomically —
    // Wrapping all three in a transaction means a partial failure (e.g., spinLog
    // create fails after points are deducted) rolls back cleanly with no lost points.
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        const deducted = await tx.userPoints.updateMany({
          where: { userId, points: { gte: spinCost } },
          data: { points: { decrement: spinCost } }
        })
        if (deducted.count === 0) {
          throw Object.assign(new Error('Insufficient points'), { statusCode: 400 })
        }
        const afterDeduct = await tx.userPoints.findUnique({ where: { userId } })
        await tx.pointsLog.create({
          data: { userId, direction: 'decrease', points: spinCost, total: afterDeduct.points, method: 'Game - Win Wheel' },
        })
        // Pre-claim the spin slot. Any concurrent request that slips past the lock
        // will see this pending entry in the daily count and be rejected.
        const spinLog = await tx.wheelSpinLog.create({
          data: { userId, result, sliceIndex, status: 'pending' }
        })
        return { spinLog }
      })
      spinLogId = txResult.spinLog.id
    } catch (txErr) {
      if (txErr.statusCode === 400) {
        throw createError({ statusCode: 400, statusMessage: 'Insufficient points' })
      }
      throw createError({ statusCode: 500, statusMessage: 'Failed to initiate spin — no points were deducted.' })
    }

    // — From here on any failure must refund points. Use a single try/catch so
    //   compensation covers prize delivery failures. —
    try {
      // — Award prize —
      if (result === 'points') {
        const updated = await prisma.userPoints.upsert({
          where: { userId },
          create: { userId, points: prizePoints },
          update: { points: { increment: prizePoints } }
        })
        await prisma.pointsLog.create({
          data: { userId, direction: 'increase', points: prizePoints, total: updated.points, method: 'Game - Win Wheel' }
        })
      }

      if (ctoonIdToMint) {
        const qe = getQueueEvents()
        await qe.waitUntilReady()
        const job = await mintQueue.add('mintCtoon', {
          userId,
          ctoonId: ctoonIdToMint,
          isSpecial: true,
          method: 'WINWHEEL'
        })
        // Second arg to waitUntilFinished is the client-side wait TTL in ms.
        // The `timeout` field on add() options does not exist in BullMQ v5.
        await job.waitUntilFinished(qe, MINT_JOB_TIMEOUT_MS)
      }

      // — Mark spin complete and record prize details —
      await prisma.wheelSpinLog.update({
        where: { id: spinLogId },
        data: {
          status: 'completed',
          points: result === 'points' ? prizePoints : null,
          ctoonId: ctoonIdToMint ?? null
        }
      })
    } catch (spinErr) {
      // Compensate: refund the spin cost and mark the spin slot as failed so it
      // doesn't count against the daily limit. Best-effort — log if compensation fails.
      try {
        const refunded = await prisma.userPoints.update({
          where: { userId },
          data: { points: { increment: spinCost } }
        })
        await prisma.pointsLog.create({
          data: { userId, direction: 'increase', points: spinCost, total: refunded.points, method: 'Game - Win Wheel (Refund)' }
        })
        if (spinLogId) {
          await prisma.wheelSpinLog.update({
            where: { id: spinLogId },
            data: { status: 'failed' }
          })
        }
      } catch (compensationErr) {
        console.error('[WinWheel] Compensation failed for spinLog', spinLogId, compensationErr)
      }
      throw createError({ statusCode: 500, statusMessage: spinErr.message || 'Spin failed — points refunded.' })
    }

    // — Triple Nothing bonus: 3 consecutive 'nothing' results in one day —
    // Runs only after the primary spin above is durably 'completed', and entirely
    // inside its own try/catch: a failure here (bad config, sold-out cToon, mint
    // timeout) must never refund or fail the primary spin the player already had.
    let tripleNothingBonus = null
    if (result === 'nothing' && tripleNothingCtoonId) {
      try {
        const alreadyClaimedToday = await prisma.wheelSpinLog.findFirst({
          where: { userId, result: 'tripleNothing', createdAt: { gte: windowStart } },
          select: { id: true }
        })
        if (!alreadyClaimedToday) {
          const recent = await prisma.wheelSpinLog.findMany({
            where: {
              userId,
              createdAt: { gte: windowStart },
              status: 'completed',
              result: { not: 'tripleNothing' }
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 3,
            select: { result: true }
          })
          const isTripleNothing = recent.length === 3 && recent.every(r => r.result === 'nothing')
          if (isTripleNothing) {
            // Pre-claim the bonus slot before minting (pending → completed/failed),
            // same pattern as the primary spin's pre-claim above, so a crash or
            // timeout between a successful mint and this row landing can't leave
            // the day's claim un-recorded and re-triggerable on a later streak.
            const bonusLog = await prisma.wheelSpinLog.create({
              data: { userId, result: 'tripleNothing', status: 'pending' }
            })
            try {
              const qe = getQueueEvents()
              await qe.waitUntilReady()
              const bonusJob = await mintQueue.add('mintCtoon', {
                userId,
                ctoonId: tripleNothingCtoonId,
                isSpecial: true,
                method: 'WINWHEEL_TRIPLE_NOTHING'
              })
              await bonusJob.waitUntilFinished(qe, MINT_JOB_TIMEOUT_MS)
              await prisma.wheelSpinLog.update({
                where: { id: bonusLog.id },
                data: { status: 'completed', ctoonId: tripleNothingCtoonId }
              })
              const bonusCtoon = await prisma.ctoon.findUnique({
                where: { id: tripleNothingCtoonId },
                select: { id: true, name: true, assetPath: true }
              })
              tripleNothingBonus = { ctoon: bonusCtoon }
            } catch (bonusMintErr) {
              await prisma.wheelSpinLog.update({
                where: { id: bonusLog.id },
                data: { status: 'failed' }
              }).catch(() => {})
              // Sold out / config error / mint timeout — skip gracefully, no retry
              // today (the same cToon would still be unavailable on a later streak).
              console.error('[WinWheel] Triple Nothing bonus mint failed for user', userId, bonusMintErr)
            }
          }
        }
      } catch (streakErr) {
        console.error('[WinWheel] Triple Nothing streak check failed for user', userId, streakErr)
      }
    }

    // — Fetch won cToon details if any —
    let wonCtoon = null
    if (ctoonIdToMint) {
      wonCtoon = await prisma.ctoon.findUnique({
        where: { id: ctoonIdToMint },
        select: { id: true, name: true, assetPath: true }
      })
    }

    return {
      result,
      ...(result === 'points' ? { points: prizePoints } : {}),
      ...(wonCtoon ? { ctoon: wonCtoon } : {}),
      ...(tripleNothingBonus ? { tripleNothingBonus } : {}),
      sliceIndex
    }
  } finally {
    // Compare-and-delete: only release the lock if it still holds our token.
    // A plain DEL would incorrectly delete a lock re-acquired by another request
    // after TTL expiry (e.g., if a stalled handler outlived the 22 s TTL).
    const casRelease = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
    try {
      await redis.eval(casRelease, 1, lockKey(userId), lockToken)
    } catch (e) {
      console.error('[WinWheel] Failed to release spin lock for user', userId, e)
    }
  }
})
