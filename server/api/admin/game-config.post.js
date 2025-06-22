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
    // Winball needs all four cup‐point fields + dailyPointLimit
    ['leftCupPoints','rightCupPoints','goldCupPoints','dailyPointLimit']
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
  }
  else if (payload.gameName === 'Clash') {
    // Clash needs pointsPerWin + dailyPointLimit
    if (payload.pointsPerWin == null || typeof payload.pointsPerWin !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid "pointsPerWin", must be a number'
      })
    }
    if (payload.dailyPointLimit == null || typeof payload.dailyPointLimit !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid "dailyPointLimit", must be a number'
      })
    }
  }
  else {
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
    // shared field
    dailyPointLimit,
    grandPrizeCtoonId,
    // Clash field
    pointsPerWin
  } = body

  // 3) Upsert
  try {
    const result = await db.$transaction(tx => {
      // build create / update objects based on gameName
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
      } else { // Clash
        createData = {
          ...createData,
          pointsPerWin
        }
        updateData = {
          ...updateData,
          pointsPerWin
        }
      }

      return tx.gameConfig.upsert({
        where: { gameName },
        create: createData,
        update: updateData,
        include: {
          // only Winball has a grandPrizeCtoon relation
          grandPrizeCtoon: {
            select: { id: true, name: true, rarity: true, assetPath: true }
          }
        }
      })
    })

    return result
  } catch (err) {
    console.error('Error upserting GameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save game configuration' })
  }
})
