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
            grandPrizeCtoonId: null,
            winballColorBackground: '#ffffff',
            winballColorBackboard: '#F0E6FF',
            winballColorWalls: '#4b4b4b',
            winballColorBall: '#ff0000',
            winballColorBumpers: '#8c8cff',
            winballColorLeftCup: '#8c8cff',
            winballColorRightCup: '#8c8cff',
            winballColorGoldCup: '#FFD700',
            winballColorCap: '#ffd000',
            winballColorTransform: '#ffffff',
            winballColorTransformIntensity: 0,
            winballOverlayColor: '#ffffff',
            winballOverlayAlpha: 0,
            winballImageWidthPercent: 100,
            winballImageOffsetXPercent: 0,
            winballImageOffsetYPercent: 0,
            winballGravity: 15,
            winballBallMass: 8,
            winballBallLinearDamping: 0.2,
            winballBallAngularDamping: 0,
            winballBallWallRestitution: 1.2,
            winballPlungerMaxPull: 0.6,
            winballPlungerImpactFactor: 0.2,
            winballPlungerForce: 500,
            winballPeg1Radius: 0.5, winballPeg1Height: 4, winballPeg1X: -11, winballPeg1Z: -17,
            winballPeg2Radius: 0.5, winballPeg2Height: 4, winballPeg2X: -3,  winballPeg2Z: -17,
            winballPeg3Radius: 0.5, winballPeg3Height: 4, winballPeg3X: 5,   winballPeg3Z: -17,
            winballPeg4Radius: 0.5, winballPeg4Height: 4, winballPeg4X: 12,  winballPeg4Z: -17,
            winballPeg5Radius: 0.5, winballPeg5Height: 4, winballPeg5X: -12, winballPeg5Z: -6,
            winballPeg6Radius: 0.5, winballPeg6Height: 4, winballPeg6X: -5,  winballPeg6Z: -6,
            winballPeg7Radius: 0.5, winballPeg7Height: 4, winballPeg7X: 2,   winballPeg7Z: -6,
            winballPeg8Radius: 0.5, winballPeg8Height: 4, winballPeg8X: 10,  winballPeg8Z: -6,
            winballPeg9Radius: 0.5, winballPeg9Height: 4, winballPeg9X: -12, winballPeg9Z: 4,
            winballPeg10Radius: 0.5, winballPeg10Height: 4, winballPeg10X: -5, winballPeg10Z: 5,
            winballPeg11Radius: 0.5, winballPeg11Height: 4, winballPeg11X: 3,  winballPeg11Z: 4,
            winballPeg12Radius: 0.5, winballPeg12Height: 4, winballPeg12X: 11, winballPeg12Z: 4
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
