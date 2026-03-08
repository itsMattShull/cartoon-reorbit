// server/api/admin/game-config.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

function validatePayload(payload) {
  if (!payload?.gameName || typeof payload.gameName !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "gameName"' })
  }

  if (payload.gameName === 'Winball') {
    ['leftCupPoints','rightCupPoints','goldCupPoints'].forEach(fld => {
      if (payload[fld] == null || typeof payload[fld] !== 'number') {
        throw createError({ statusCode: 400, statusMessage: `Missing or invalid "${fld}", must be a number` })
      }
    })
    if (payload.grandPrizeCtoonId != null && typeof payload.grandPrizeCtoonId !== 'string') {
      throw createError({ statusCode: 400, statusMessage: '"grandPrizeCtoonId" must be a string or null' })
    }
    const colorFields = [
      'winballColorBackground','winballColorBackboard','winballColorWalls','winballColorBall',
      'winballColorBumpers','winballColorLeftCup','winballColorRightCup','winballColorGoldCup','winballColorCap','winballColorTransform','winballOverlayColor',
      'winballBackboardImagePath','winballBumper1ImagePath','winballBumper2ImagePath','winballBumper3ImagePath'
    ]
    for (const fld of colorFields) {
      if (payload[fld] != null && typeof payload[fld] !== 'string') {
        throw createError({ statusCode: 400, statusMessage: `"${fld}" must be a string or null` })
      }
    }
    const physicsFields = [
      'winballGravity','winballBallMass','winballBallLinearDamping','winballBallAngularDamping',
      'winballBallWallRestitution','winballPlungerMaxPull','winballPlungerImpactFactor','winballPlungerForce',
      'winballOverlayAlpha','winballColorTransformIntensity','winballImageWidthPercent','winballImageOffsetXPercent','winballImageOffsetYPercent'
    ]
    for (const fld of physicsFields) {
      if (payload[fld] != null && typeof payload[fld] !== 'number') {
        throw createError({ statusCode: 400, statusMessage: `"${fld}" must be a number or null` })
      }
    }

  } else if (payload.gameName === 'Clash') {
    if (payload.pointsPerWin == null || typeof payload.pointsPerWin !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "pointsPerWin", must be a number' })
    }

  } else if (payload.gameName === 'Winwheel') {
    if (payload.spinCost == null || typeof payload.spinCost !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "spinCost", must be a number' })
    }
    if (payload.pointsWon == null || typeof payload.pointsWon !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "pointsWon", must be a number' })
    }
    if (payload.maxDailySpins == null || typeof payload.maxDailySpins !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "maxDailySpins", must be a number' })
    }
    if (!Array.isArray(payload.exclusiveCtoons)) {
      throw createError({ statusCode: 400, statusMessage: 'Missing or invalid "exclusiveCtoons", must be an array of cToon IDs' })
    }
    payload.exclusiveCtoons.forEach(id => {
      if (typeof id !== 'string') {
        throw createError({ statusCode: 400, statusMessage: 'Each entry in "exclusiveCtoons" must be a string cToon ID' })
      }
    })
    if (payload.winWheelImagePath != null && typeof payload.winWheelImagePath !== 'string') {
      throw createError({ statusCode: 400, statusMessage: '"winWheelImagePath" must be a string or null' })
    }
    if (payload.winWheelSoundPath != null && typeof payload.winWheelSoundPath !== 'string') {
      throw createError({ statusCode: 400, statusMessage: '"winWheelSoundPath" must be a string or null' })
    }
    if (
      payload.winWheelSoundMode != null &&
      payload.winWheelSoundMode !== 'repeat' &&
      payload.winWheelSoundMode !== 'once'
    ) {
      throw createError({ statusCode: 400, statusMessage: '"winWheelSoundMode" must be "repeat", "once", or null' })
    }

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
    winballColorBackground = null,
    winballColorBackboard = null,
    winballColorWalls = null,
    winballColorBall = null,
    winballColorBumpers = null,
    winballColorLeftCup = null,
    winballColorRightCup = null,
    winballColorGoldCup = null,
    winballColorCap = null,
    winballColorTransform = null,
    winballOverlayColor = null,
    winballBackboardImagePath = null,
    winballBumper1ImagePath = null,
    winballBumper2ImagePath = null,
    winballBumper3ImagePath = null,
    winballGravity = null,
    winballBallMass = null,
    winballBallLinearDamping = null,
    winballBallAngularDamping = null,
    winballBallWallRestitution = null,
    winballPlungerMaxPull = null,
    winballPlungerImpactFactor = null,
    winballPlungerForce = null,
    winballOverlayAlpha = null,
    winballColorTransformIntensity = null,
    winballImageWidthPercent = null,
    winballImageOffsetXPercent = null,
    winballImageOffsetYPercent = null,
    // Clash field
    pointsPerWin,
    // Winwheel fields
    spinCost,
    pointsWon,
    maxDailySpins,
    exclusiveCtoons = [],
    winWheelImagePath = null,
    winWheelSoundPath = null,
    winWheelSoundMode = null
  } = body

  // 3) Upsert
  try {
    const before = await db.gameConfig.findUnique({
      where: { gameName },
      include: { exclusiveCtoons: true }
    })
    const result = await db.$transaction(async tx => {
      let createData = { gameName }
      let updateData = { updatedAt: new Date() }

      if (gameName === 'Winball') {
        const winballColors = {
          winballColorBackground: winballColorBackground || '#ffffff',
          winballColorBackboard: winballColorBackboard || '#F0E6FF',
          winballColorWalls: winballColorWalls || '#4b4b4b',
          winballColorBall: winballColorBall || '#ff0000',
          winballColorBumpers: winballColorBumpers || '#8c8cff',
          winballColorLeftCup: winballColorLeftCup || '#8c8cff',
          winballColorRightCup: winballColorRightCup || '#8c8cff',
          winballColorGoldCup: winballColorGoldCup || '#FFD700',
          winballColorCap: winballColorCap || '#ffd000',
          winballColorTransform: winballColorTransform || '#ffffff',
          winballOverlayColor: winballOverlayColor || '#ffffff',
          winballBackboardImagePath: winballBackboardImagePath || null,
          winballBumper1ImagePath: winballBumper1ImagePath || null,
          winballBumper2ImagePath: winballBumper2ImagePath || null,
          winballBumper3ImagePath: winballBumper3ImagePath || null
        }
        const winballPhysics = {
          winballGravity:             winballGravity             ?? 15,
          winballBallMass:            winballBallMass            ?? 8,
          winballBallLinearDamping:   winballBallLinearDamping   ?? 0.2,
          winballBallAngularDamping:  winballBallAngularDamping  ?? 0,
          winballBallWallRestitution: winballBallWallRestitution ?? 1.2,
          winballPlungerMaxPull:      winballPlungerMaxPull      ?? 0.6,
          winballPlungerImpactFactor: winballPlungerImpactFactor ?? 0.2,
          winballPlungerForce:        winballPlungerForce        ?? 500,
          winballOverlayAlpha:         winballOverlayAlpha         ?? 0,
          winballColorTransformIntensity: winballColorTransformIntensity ?? 0,
          winballImageWidthPercent:    winballImageWidthPercent    ?? 100,
          winballImageOffsetXPercent:  winballImageOffsetXPercent  ?? 0,
          winballImageOffsetYPercent:  winballImageOffsetYPercent  ?? 0
        }
        createData = {
          ...createData,
          leftCupPoints,
          rightCupPoints,
          goldCupPoints,
          grandPrizeCtoonId: grandPrizeCtoonId || null,
          ...winballColors,
          ...winballPhysics
        }
        updateData = {
          ...updateData,
          leftCupPoints,
          rightCupPoints,
          goldCupPoints,
          grandPrizeCtoonId: grandPrizeCtoonId || null,
          ...winballColors,
          ...winballPhysics
        }
      } else if (gameName === 'Clash') {
        createData = { ...createData, pointsPerWin }
        updateData = { ...updateData, pointsPerWin }
      } else if (gameName === 'Winwheel') {
        console.log('Upserting Winwheel config with image path:', winWheelImagePath) 
        createData = {
          ...createData,
          spinCost,
          pointsWon,
          maxDailySpins,
          winWheelImagePath: winWheelImagePath || null,
          winWheelSoundPath: winWheelSoundPath || null,
          winWheelSoundMode: winWheelSoundMode || 'repeat'
        }
        updateData = {
          ...updateData,
          spinCost,
          pointsWon,
          maxDailySpins,
          winWheelImagePath: winWheelImagePath || null,
          winWheelSoundPath: winWheelSoundPath || null,
          winWheelSoundMode: winWheelSoundMode || 'repeat'
        }
      }

      const includeOptions = gameName === 'Winball'
        ? { grandPrizeCtoon: { select: { id: true, name: true, rarity: true, assetPath: true } } }
        : gameName === 'Winwheel'
          ? { exclusiveCtoons: { include: { ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } } } } }
          : undefined

      const cfg = await tx.gameConfig.upsert({
        where: { gameName },
        create: createData,
        update: updateData,
        include: includeOptions
      })

      if (gameName === 'Winwheel') {
        await tx.winWheelOption.deleteMany({ where: { gameConfigId: cfg.id } })
        if (exclusiveCtoons.length) {
          await tx.winWheelOption.createMany({
            data: exclusiveCtoons.map(ctoonId => ({ gameConfigId: cfg.id, ctoonId }))
          })
        }
      }

      // Log changes within the transaction (best-effort)
      try {
        const area = `GameConfig:${gameName}`
        if (gameName === 'Winball') {
          const changes = [
            ['leftCupPoints', before?.leftCupPoints, leftCupPoints],
            ['rightCupPoints', before?.rightCupPoints, rightCupPoints],
            ['goldCupPoints', before?.goldCupPoints, goldCupPoints],
            ['grandPrizeCtoonId', before?.grandPrizeCtoonId || null, grandPrizeCtoonId || null],
            ['winballColorBackground', before?.winballColorBackground, winballColorBackground],
            ['winballColorBackboard', before?.winballColorBackboard, winballColorBackboard],
            ['winballColorWalls', before?.winballColorWalls, winballColorWalls],
            ['winballColorBall', before?.winballColorBall, winballColorBall],
            ['winballColorBumpers', before?.winballColorBumpers, winballColorBumpers],
            ['winballColorLeftCup', before?.winballColorLeftCup, winballColorLeftCup],
            ['winballColorRightCup', before?.winballColorRightCup, winballColorRightCup],
            ['winballColorGoldCup', before?.winballColorGoldCup, winballColorGoldCup],
            ['winballColorCap', before?.winballColorCap, winballColorCap],
            ['winballColorTransform', before?.winballColorTransform, winballColorTransform],
            ['winballOverlayColor', before?.winballOverlayColor, winballOverlayColor],
            ['winballBackboardImagePath', before?.winballBackboardImagePath || null, winballBackboardImagePath || null],
            ['winballBumper1ImagePath', before?.winballBumper1ImagePath || null, winballBumper1ImagePath || null],
            ['winballBumper2ImagePath', before?.winballBumper2ImagePath || null, winballBumper2ImagePath || null],
            ['winballBumper3ImagePath', before?.winballBumper3ImagePath || null, winballBumper3ImagePath || null],
            ['winballGravity', before?.winballGravity, winballGravity],
            ['winballBallMass', before?.winballBallMass, winballBallMass],
            ['winballBallLinearDamping', before?.winballBallLinearDamping, winballBallLinearDamping],
            ['winballBallAngularDamping', before?.winballBallAngularDamping, winballBallAngularDamping],
            ['winballBallWallRestitution', before?.winballBallWallRestitution, winballBallWallRestitution],
            ['winballPlungerMaxPull', before?.winballPlungerMaxPull, winballPlungerMaxPull],
            ['winballPlungerImpactFactor', before?.winballPlungerImpactFactor, winballPlungerImpactFactor],
            ['winballPlungerForce', before?.winballPlungerForce, winballPlungerForce],
            ['winballOverlayAlpha', before?.winballOverlayAlpha, winballOverlayAlpha],
            ['winballColorTransformIntensity', before?.winballColorTransformIntensity, winballColorTransformIntensity],
            ['winballImageWidthPercent', before?.winballImageWidthPercent, winballImageWidthPercent],
            ['winballImageOffsetXPercent', before?.winballImageOffsetXPercent, winballImageOffsetXPercent],
            ['winballImageOffsetYPercent', before?.winballImageOffsetYPercent, winballImageOffsetYPercent]
          ]
          for (const [key, prev, next] of changes) {
            if (prev !== next) await logAdminChange(tx, { userId: me.id, area, key, prevValue: prev, newValue: next })
          }
        } else if (gameName === 'Clash') {
          if (before?.pointsPerWin !== pointsPerWin) {
            await logAdminChange(tx, { userId: me.id, area, key: 'pointsPerWin', prevValue: before?.pointsPerWin, newValue: pointsPerWin })
          }
        } else if (gameName === 'Winwheel') {
          const changes = [
            ['spinCost', before?.spinCost, spinCost],
            ['pointsWon', before?.pointsWon, pointsWon],
            ['maxDailySpins', before?.maxDailySpins, maxDailySpins],
            ['winWheelImagePath', before?.winWheelImagePath || null, winWheelImagePath || null],
            ['winWheelSoundPath', before?.winWheelSoundPath || null, winWheelSoundPath || null],
            ['winWheelSoundMode', before?.winWheelSoundMode || 'repeat', winWheelSoundMode || 'repeat']
          ]
          for (const [key, prev, next] of changes) {
            if (prev !== next) await logAdminChange(tx, { userId: me.id, area, key, prevValue: prev, newValue: next })
          }
          // pool change
          const beforeIds = (before?.exclusiveCtoons || []).map(r => r.ctoonId).sort()
          const afterIds  = (exclusiveCtoons || []).slice().sort()
          if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
            await logAdminChange(tx, {
              userId: me.id,
              area,
              key: 'exclusiveCtoons',
              prevValue: beforeIds,
              newValue: afterIds
            })
          }
        }
      } catch {}

      return cfg
    })

    return result
  } catch (err) {
    console.error('Error upserting GameConfig:', err)
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, statusMessage: 'Failed to save game configuration' })
  }
})
