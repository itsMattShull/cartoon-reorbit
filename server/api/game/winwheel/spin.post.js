// server/api/game/winwheel/spin.post.js
import { prisma } from '@/server/prisma'
import { createError } from 'h3'
import { mintQueue } from '../../../utils/queues'
import { QueueEvents } from 'bullmq'

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // — Load Winwheel config
  const config = await prisma.gameConfig.findUnique({
    where: { gameName: 'Winwheel' },
    include: { exclusiveCtoons: { include: { ctoon: true } } }
  })
  if (!config) {
    throw createError({ statusCode: 500, statusMessage: 'Winwheel config not found' })
  }
  const { spinCost, pointsWon, maxDailySpins, exclusiveCtoons } = config
  const pool = exclusiveCtoons.map(o => o.ctoon)

  // — Enforce daily limit (8 AM CST → 8 AM CST) —
  const now = new Date()
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs   = now.getTime() - chicagoNow.getTime()
  const y = chicagoNow.getFullYear(), m = chicagoNow.getMonth(), d = chicagoNow.getDate()
  let resetUtcMs = new Date(y, m, d, 8, 0, 0).getTime() + offsetMs
  if (now.getTime() < resetUtcMs) {
    resetUtcMs -= 24 * 60 * 60 * 1000
  }
  const windowStart = new Date(resetUtcMs)
  const spinsToday = await prisma.wheelSpinLog.count({
    where: { userId, createdAt: { gte: windowStart } }
  })
  if (spinsToday >= maxDailySpins) {
    const nextReset = new Date(resetUtcMs + 24 * 60 * 60 * 1000)
    throw createError({
      statusCode: 429,
      statusMessage: 'Daily spin limit reached',
      data: { nextReset: nextReset.toISOString() }
    })
  }

  // — Deduct spin cost —
  const up = await prisma.userPoints.findUnique({ where: { userId } })
  if ((up?.points || 0) < spinCost) {
    throw createError({ statusCode: 400, statusMessage: 'Insufficient points' })
  }
  await prisma.userPoints.update({
    where: { userId },
    data: { points: { decrement: spinCost } },
  })
  await prisma.pointsLog.create({
    data: { userId, direction: 'decrease', points: spinCost, method: 'wheel-spin' },
  })

  // — Spin the wheel —
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

    case 2:
      result = 'ctoonLeast'
      // — choose the "least minted" Common cToon in C-Mart that has already released —
      // 1) find all Commons in C-Mart whose releaseDate is before now
      const commons = await prisma.ctoon.findMany({
        where: {
          inCmart: true,
          rarity: 'Common',
          releaseDate: { lt: new Date() }
        }
      })
      // 2) compute highest mint number for each
      const withMints = await Promise.all(commons.map(async c => {
        const agg = await prisma.userCtoon.aggregate({
          where: { ctoonId: c.id },
          _max: { mintNumber: true }
        })
        return { ctoon: c, highestMint: agg._max.mintNumber || 0 }
      }))
      // 3) pick those where highestMint < total quantity
      const finite = withMints.filter(({ ctoon, highestMint }) =>
        ctoon.quantity != null && highestMint < ctoon.quantity
      )
      if (finite.length > 0) {
        const minMint = Math.min(...finite.map(x => x.highestMint))
        const least  = finite.filter(x => x.highestMint === minMint)
        ctoonIdToMint = least[Math.floor(Math.random() * least.length)].ctoon.id
      } else {
        // fallback: Commons with unlimited quantity and already released
        const unlimited = commons.filter(c => c.quantity == null)
        if (unlimited.length === 0) {
          throw createError({
            statusCode: 500,
            statusMessage: 'No Common cToons available for least-desirable prize'
          })
        }
        ctoonIdToMint = unlimited[Math.floor(Math.random() * unlimited.length)].id
      }
      break

    case 5:
      result = 'ctoonExclusive'
      if (pool.length === 0) {
        throw createError({
          statusCode: 500,
          statusMessage: 'No exclusive cToons configured for Winwheel'
        })
      }
      ctoonIdToMint = pool[Math.floor(Math.random() * pool.length)].id
      break
  }

  // — Award points if needed —
  if (result === 'points') {
    await prisma.userPoints.upsert({
      where: { userId },
      create: { userId, points: prizePoints },
      update: { points: { increment: prizePoints } }
    })
    await prisma.gamePointLog.create({ data: { userId, points: prizePoints } })
    await prisma.pointsLog.create({
      data: { userId, direction: 'increase', points: prizePoints, method: 'wheel-spin' }
    })
  }

  // — Mint cToon if needed —
  let ctoonJobResult = null
  if (ctoonIdToMint) {
    const job = await mintQueue.add('mintCtoon', {
      userId,
      ctoonId: ctoonIdToMint,
      isSpecial: true
    })
    const qe = new QueueEvents(mintQueue.name, { connection: redisConnection })
    await qe.waitUntilReady()
    try {
      await job.waitUntilFinished(qe)
      ctoonJobResult = { success: true, ctoonId: ctoonIdToMint }
    } catch (err) {
      throw createError({ statusCode: 500, statusMessage: err.message })
    } finally {
      await qe.close()
    }
  }

  // — Log the spin —
  await prisma.wheelSpinLog.create({
    data: {
      userId,
      result,
      points:  result === 'points' ? prizePoints : null,
      ctoonId: ctoonIdToMint,
      sliceIndex
    }
  })

  // — Fetch won cToon details if any —
  let wonCtoon = null
  if (ctoonIdToMint) {
    wonCtoon = await prisma.ctoon.findUnique({
      where: { id: ctoonIdToMint },
      select: { id: true, name: true, assetPath: true }
    })
  }

  // — Return response —
  return {
    result,
    ...(result === 'points' ? { points: prizePoints } : {}),
    ...(wonCtoon ? { ctoon: wonCtoon } : {}),
    sliceIndex
  }
})
