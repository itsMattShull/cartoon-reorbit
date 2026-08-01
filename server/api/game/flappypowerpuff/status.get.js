import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { getDailyWindowStart, getWeekWindowStart } from '@/server/utils/centralTime'

// weekHigh is a single global figure identical for every viewer, and computing it scans every
// score row in the week. Shared cache, short TTL.
const WEEK_HIGH_KEY = 'flappy:weekhigh'
const WEEK_HIGH_TTL = 60

const DEFAULT_SPRITES = {
  blossom: '/flappypowerpuff/blossom.png',
  bubbles: '/flappypowerpuff/bubbles.png',
  buttercup: '/flappypowerpuff/buttercup.png',
  city: '/flappypowerpuff/city.png'
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const config = await prisma.gameConfig.findUnique({
    where: { gameName: 'FlappyPowerpuff' },
    select: {
      flappyPlaysPerPeriod: true,
      flappyPointsPerGame: true,
      flappyBlossomImagePath: true,
      flappyBubblesImagePath: true,
      flappyButtercupImagePath: true,
      flappyCityImagePath: true
    }
  })
  const playsPerPeriod = config?.flappyPlaysPerPeriod ?? 3

  const boundary = getDailyWindowStart()
  const nextReset = new Date(boundary.getTime() + 24 * 60 * 60 * 1000)

  let weekHigh = null
  try {
    const cached = await redis.get(WEEK_HIGH_KEY)
    if (cached !== null) weekHigh = Number(cached)
  } catch {}

  const [rankedPlaysToday, allTimeHigh, freshWeekHigh] = await Promise.all([
    prisma.flappyPowerpuffPlay.count({
      where: { userId, ranked: true, createdAt: { gte: boundary } }
    }),
    prisma.flappyPowerpuffScore.aggregate({
      where: { userId },
      _max: { score: true }
    }),
    weekHigh === null
      ? prisma.flappyPowerpuffScore.aggregate({
        where: { createdAt: { gte: getWeekWindowStart() } },
        _max: { score: true }
      })
      : Promise.resolve(null)
  ])

  if (weekHigh === null) {
    weekHigh = freshWeekHigh?._max.score ?? 0
    try { await redis.set(WEEK_HIGH_KEY, String(weekHigh), 'EX', WEEK_HIGH_TTL) } catch {}
  }

  const playsLeft = Math.max(0, playsPerPeriod - rankedPlaysToday)

  return {
    config: {
      playsPerPeriod,
      pointsPerGame: config?.flappyPointsPerGame ?? 50
    },
    sprites: {
      blossom: config?.flappyBlossomImagePath || DEFAULT_SPRITES.blossom,
      bubbles: config?.flappyBubblesImagePath || DEFAULT_SPRITES.bubbles,
      buttercup: config?.flappyButtercupImagePath || DEFAULT_SPRITES.buttercup,
      city: config?.flappyCityImagePath || DEFAULT_SPRITES.city
    },
    playsLeft,
    // Explicit, rather than overloading playsLeft: every other game on the site treats
    // playsLeft === 0 as terminal, and this one keeps letting you play.
    canPlayUnranked: true,
    playsResetAt: nextReset.toISOString(),
    allTimeHigh: allTimeHigh._max.score ?? 0,
    weekHigh
  }
})
