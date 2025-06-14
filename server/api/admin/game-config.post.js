// server/api/admin/game-config.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'

import { prisma as db } from '@/server/prisma'

function validatePayload(payload) {
  if (!payload?.gameName || typeof payload.gameName !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "gameName"' })
  }
  ['leftCupPoints', 'rightCupPoints', 'goldCupPoints', 'dailyPointLimit'].forEach(field => {
    if (payload[field] == null || typeof payload[field] !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: `Missing or invalid "${field}", must be a number`
      })
    }
  })
  if (payload.grandPrizeCtoonId != null && typeof payload.grandPrizeCtoonId !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'grandPrizeCtoonId must be a string or null'
    })
  }
}

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

  // 2) Read JSON body and validate
  const body = await readBody(event)
  validatePayload(body)

  const {
    gameName,
    leftCupPoints,
    rightCupPoints,
    goldCupPoints,
    dailyPointLimit,
    grandPrizeCtoonId
  } = body

  // 3) Upsert within a transaction
  try {
    const result = await db.$transaction(async (tx) => {
      return await tx.gameConfig.upsert({
        where: { gameName },
        create: {
          gameName,
          leftCupPoints,
          rightCupPoints,
          goldCupPoints,
          dailyPointLimit,
          grandPrizeCtoonId: grandPrizeCtoonId || null
        },
        update: {
          leftCupPoints,
          rightCupPoints,
          goldCupPoints,
          dailyPointLimit,
          grandPrizeCtoonId: grandPrizeCtoonId || null,
          updatedAt: new Date()
        },
        include: {
          grandPrizeCtoon: {
            select: {
              id: true,
              name: true,
              rarity: true,
              assetPath: true
            }
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
