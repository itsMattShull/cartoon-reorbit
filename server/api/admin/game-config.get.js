// server/api/admin/game-config.get.js
import {
  defineEventHandler,
  getQuery,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2) Query param
  const { gameName } = getQuery(event)
  if (!gameName || typeof gameName !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid "gameName" query parameter'
    })
  }

  // 3) Dynamic include
  const includeOptions = {}
  if (gameName === 'Winball') {
    includeOptions.grandPrizeCtoon = {
      select: { id: true, name: true, rarity: true, assetPath: true }
    }
  } else if (gameName === 'Winwheel') {
    includeOptions.exclusiveCtoons = {
      include: {
        ctoon: {
          select: { id: true, name: true, rarity: true, assetPath: true }
        }
      }
    }
  }

  try {
    // 4) Load existing config
    let config = await db.gameConfig.findUnique({
      where: { gameName },
      include: includeOptions
    })

    // 5) Create defaults if missing
    if (!config) {
      if (gameName === 'Winball') {
        const schedules = await db.winballGrandPrizeSchedule.findMany({
          orderBy: { startsAt: 'desc' },
          take: 200,
          include: { ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } } }
        })
        config.schedules = schedules
        
        config = await db.gameConfig.create({
          data: {
            gameName,
            leftCupPoints: 0,
            rightCupPoints: 0,
            goldCupPoints: 0,
            grandPrizeCtoonId: null
          },
          include: includeOptions
        })
      } else if (gameName === 'Clash') {
        config = await db.gameConfig.create({
          data: {
            gameName,
            pointsPerWin: 0
          }
        })
      } else if (gameName === 'Winwheel') {
        config = await db.gameConfig.create({
          data: {
            gameName,
            spinCost: 100,
            pointsWon: 250,
            maxDailySpins: 2,
            winWheelImagePath: null, // ensure field exists in response
            winWheelSoundPath: null,
            winWheelSoundMode: 'repeat'
          },
          include: includeOptions
        })
      } else {
        throw createError({
          statusCode: 400,
          statusMessage: `Unknown gameName "${gameName}"`
        })
      }
    }

    // Scalars (incl. winWheelImagePath) are returned by default.
    return config
  } catch (err) {
    console.error('Failed to fetch or create GameConfig:', err)
    if (err.statusCode) throw err
    throw createError({
      statusCode: 500,
      statusMessage: 'Unable to load or initialize game configuration'
    })
  }
})
