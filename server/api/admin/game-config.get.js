// server/api/admin/game-config.get.js
import {
  defineEventHandler,
  getQuery,
  getRequestHeader,
  createError
} from 'h3'

import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Ensure user is authenticated & isAdmin
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

  // 2) Read query parameter
  const query = getQuery(event)
  const gameName = query.gameName
  if (!gameName || typeof gameName !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "gameName" query parameter' })
  }

  try {
    // 3) Try to fetch existing config
    let config = await db.gameConfig.findUnique({
      where: { gameName },
      include: {
        grandPrizeCtoon: {
          select: {
            id:        true,
            name:      true,
            rarity:    true,
            assetPath: true
          }
        }
      }
    })

    // 4) If not found, create a new default row
    if (!config) {
      config = await db.gameConfig.create({
        data: {
          gameName,
          leftCupPoints:     0,
          rightCupPoints:    0,
          goldCupPoints:     0,
          grandPrizeCtoonId: null
        },
        include: {
          grandPrizeCtoon: {
            select: {
              id:        true,
              name:      true,
              rarity:    true,
              assetPath: true
            }
          }
        }
      })
    }

    return config
  } catch (err) {
    console.error('Failed to fetch or create GameConfig:', err)
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: 'Unable to load or initialize game configuration' })
  }
})
