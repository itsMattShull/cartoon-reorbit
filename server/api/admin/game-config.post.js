// server/api/admin/game-config.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'

// ensure payload has the right fields for each game
function validatePayload(payload) {
  if (!payload?.gameName || typeof payload.gameName !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "gameName"' })
  }

  if (payload.gameName === 'Winball') {
    // Winball needs leftCupPoints, rightCupPoints, goldCupPoints
    ['leftCupPoints','rightCupPoints','goldCupPoints']
      .forEach(fld => {
        if (payload[fld] == null || typeof payload[fld] !== 'number') {
          throw createError({
            statusCode: 400,
            statusMessage: `Missing or invalid "${fld}", must be a number`
          })
        }
      })
    if (payload.grandPrizeCtoonId != null && typeof payload.grandPrizeCtoonId !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: '"grandPrizeCtoonId" must be a string or null'
      })
    }

  } else if (payload.gameName === 'Clash') {
    // Clash needs pointsPerWin
    if (payload.pointsPerWin == null || typeof payload.pointsPerWin !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid "pointsPerWin", must be a number'
      })
    }

  } else if (payload.gameName === 'Winwheel') {
    // Winwheel needs spinCost, pointsWon, maxDailySpins and exclusiveCtoons[]
    if (payload.spinCost == null || typeof payload.spinCost !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid "spinCost", must be a number'
      })
    }
    if (payload.pointsWon == null || typeof payload.pointsWon !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid "pointsWon", must be a number'
      })
    }
    if (payload.maxDailySpins == null || typeof payload.maxDailySpins !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid "maxDailySpins", must be a number'
      })
    }
    if (!Array.isArray(payload.exclusiveCtoons)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid "exclusiveCtoons", must be an array of cToon IDs'
      })
    }
    payload.exclusiveCtoons.forEach(id => {
      if (typeof id !== 'string') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Each entry in "exclusiveCtoons" must be a string cToon ID'
        })
      }
    })

  } else {
    throw createError({ statusCode: 400, statusMessage: `Unknown gameName "${payload.gameName}"` })
  }
}

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

  // 2) Read + validate
  const body = await readBody(event)
  validatePayload(body)

  const {
    gameName,
    // Winball fields
    leftCupPoints,
    rightCupPoints,
    goldCupPoints,
    grandPrizeCtoonId,
    // Clash field
    pointsPerWin,
    // Winwheel fields
    spinCost,
    pointsWon,
    maxDailySpins,
    exclusiveCtoons = []
  } = body

  // 3) Upsert inside a transaction
  try {
    const result = await db.$transaction(async tx => {
      let createData = { gameName }
      let updateData = { updatedAt: new Date() }

      if (gameName === 'Winball') {
        createData = {
          ...createData,
          leftCupPoints,
          rightCupPoints,
          goldCupPoints,
          grandPrizeCtoonId: grandPrizeCtoonId || null
        }
        updateData = {
          ...updateData,
          leftCupPoints,
          rightCupPoints,
          goldCupPoints,
          grandPrizeCtoonId: grandPrizeCtoonId || null
        }
      } else if (gameName === 'Clash') {
        createData = { ...createData, pointsPerWin }
        updateData = { ...updateData, pointsPerWin }
      } else if (gameName === 'Winwheel') {
        createData = {
          ...createData,
          spinCost,
          pointsWon,
          maxDailySpins
        }
        updateData = {
          ...updateData,
          spinCost,
          pointsWon,
          maxDailySpins
        }
      }

      // dynamic include for return
      const includeOptions = gameName === 'Winball'
        ? { grandPrizeCtoon: { select: { id: true, name: true, rarity: true, assetPath: true } } }
        : gameName === 'Winwheel'
          ? { exclusiveCtoons: { include: { ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } } } } }
          : undefined

      // upsert the config
      const cfg = await tx.gameConfig.upsert({
        where: { gameName },
        create: createData,
        update: updateData,
        include: includeOptions
      })

      // if Winwheel, sync the pool join‐table
      if (gameName === 'Winwheel') {
        // remove old options
        await tx.winWheelOption.deleteMany({
          where: { gameConfigId: cfg.id }
        })
        // add new ones
        if (exclusiveCtoons.length) {
          await tx.winWheelOption.createMany({
            data: exclusiveCtoons.map(ctoonId => ({
              gameConfigId: cfg.id,
              ctoonId
            }))
          })
        }
      }

      return cfg
    })

    return result
  } catch (err) {
    console.error('Error upserting GameConfig:', err)
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: 'Failed to save game configuration' })
  }
})
