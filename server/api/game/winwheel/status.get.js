import { prisma } from '@/server/prisma'
import { createError } from 'h3'
import { getChicagoMorningWindowStart } from '@/server/utils/dailyTaskWindows'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // Load Winwheel config + exclusive pool.
  // tripleNothingCtoonId is intentionally NOT selected/returned here — it stays a
  // surprise and is only revealed in the spin response at the moment it's won.
  const config = await prisma.gameConfig.findUnique({
    where: { gameName: 'Winwheel' },
    select: {
      spinCost: true,
      maxDailySpins: true,
      pointsWon: true,
      winWheelImagePath: true,
      winWheelSoundPath: true,
      winWheelSoundMode: true,
      exclusiveCtoons: {
        include: {
          ctoon: {
            select: { id: true, name: true, assetPath: true }
          }
        }
      }
    }
  })
  if (!config) {
    throw createError({ statusCode: 500, statusMessage: 'Winwheel config not found' })
  }
  const {
    spinCost,
    maxDailySpins,
    pointsWon,
    winWheelImagePath,
    winWheelSoundPath,
    winWheelSoundMode
  } = config

  // Build exclusive cToon pool
  const pool = (config.exclusiveCtoons || [])
    .map((row) => row.ctoon)
    .filter(Boolean)

  const poolIds = pool.map((c) => c.id)
  const ownedRows = poolIds.length
    ? await prisma.userCtoon.findMany({
        where: { userId, ctoonId: { in: poolIds } },
        select: { ctoonId: true }
      })
    : []
  const ownedSet = new Set(ownedRows.map((r) => r.ctoonId))

  const exclusivePool = pool.map((c) => ({
    id: c.id,
    name: c.name,
    assetPath: c.assetPath,
    owned: ownedSet.has(c.id)
  }))

  // Daily window (8 AM America/Chicago)
  const windowStart = getChicagoMorningWindowStart()
  const resetUtcMs = windowStart.getTime()

  // Exclude failed spins (refunded) and 'tripleNothing' bonus rows (a reward layered
  // on top of an already-counted spin, not a spin of its own) from the daily limit.
  const spinsToday = await prisma.wheelSpinLog.count({
    where: { userId, createdAt: { gte: windowStart }, status: { not: 'failed' }, result: { not: 'tripleNothing' } }
  })
  const nextReset = new Date(resetUtcMs + 24 * 60 * 60 * 1000)

  return {
    spinsLeft: Math.max(0, maxDailySpins - spinsToday),
    nextReset: nextReset.toISOString(),
    spinCost,
    maxDailySpins,
    pointsWon,
    winWheelImagePath: winWheelImagePath || null,
    winWheelSoundPath: winWheelSoundPath || null,
    winWheelSoundMode: winWheelSoundMode || 'repeat',
    exclusivePool
  }
})
