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
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "gameName" query parameter' })
  }

  try {
    // 3) Try to load existing config
    let config = await db.gameConfig.findUnique({
      where: { gameName },
      include: {
        // only Winball uses a grandPrizeCtoon
        grandPrizeCtoon: {
          select: { id: true, name: true, rarity: true, assetPath: true }
        }
      }
    })

    // 4) If none, create defaults per‐game
    if (!config) {
      if (gameName === 'Winball') {
        config = await db.gameConfig.create({
          data: {
            gameName,
            leftCupPoints:     0,
            rightCupPoints:    0,
            goldCupPoints:     0,
            dailyPointLimit:   100,
            grandPrizeCtoonId: null
          },
          include: {
            grandPrizeCtoon: {
              select: { id: true, name: true, rarity: true, assetPath: true }
            }
          }
        })
      } else if (gameName === 'Clash') {
        config = await db.gameConfig.create({
          data: {
            gameName,
            // default points per win:
            pointsPerWin:     0,
            dailyPointLimit: 100,
            // Winball‐only fields remain null
            leftCupPoints:    null,
            rightCupPoints:   null,
            goldCupPoints:    null,
            grandPrizeCtoonId:null
          }
        })
      } else {
        throw createError({ statusCode: 400, statusMessage: `Unknown gameName "${gameName}"` })
      }
    }

    return config
  } catch (err) {
    console.error('Failed to fetch or create GameConfig:', err)
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: 'Unable to load or initialize game configuration' })
  }
})
