// server/api/admin/game-config.post.js
import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError
} from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

// ── Operation A.S.T.E.R.O.I.D. field tables ──────────────────────────────────────────────
// Kept as data rather than 26 hand-written if-blocks so the validation, the Prisma write and
// the admin change log can all be driven from one list and cannot drift apart.
// The ranges mirror normalizeConfig() in lib/asteroidSim.js.
const ASTEROID_NUMERIC_RANGES = [
  ['asteroidRankedPlaysPerPeriod', 0, 100],
  ['asteroidPointsPerGame',        0, 100000],
  ['asteroidStartingLives',        1, 9],
  ['asteroidStartAsteroids',       1, 12],
  ['asteroidAsteroidsPerWave',     0, 4],
  ['asteroidAsteroidSpeed',        0.2, 4],
  ['asteroidWaveSpeedGrowth',      0, 0.5],
  ['asteroidMaxSpeedMultiplier',   1, 5],
  ['asteroidTurnRate',             1, 24],
  ['asteroidThrustAccel',          0.02, 1],
  ['asteroidMaxShipSpeed',         1, 16],
  ['asteroidShipDrag',             0.9, 1],
  ['asteroidFireIntervalTicks',    3, 60],
  ['asteroidExtraLifeScore',       0, 1000000],
  ['asteroidPointsLarge',          0, 10000],
  ['asteroidPointsMedium',         0, 10000],
  ['asteroidPointsSmall',          0, 10000],
  ['asteroidWaveClearBonus',       0, 100000],
  ['asteroidPowerupIntervalTicks', 60, 36000],
  ['asteroidPowerupChancePercent', 0, 100],
  ['asteroidPowerupBlueTicks',     0, 7200],
  ['asteroidPowerupRedTicks',      0, 7200],
  ['asteroidPowerupGreenTicks',    0, 7200]
]

const ASTEROID_BOOLEAN_FIELDS = [
  'asteroidPowerupsEnabled',
  'asteroidPowerupBlueEnabled',
  'asteroidPowerupRedEnabled',
  'asteroidPowerupGreenEnabled'
]

const ASTEROID_FIELDS = [
  ...ASTEROID_NUMERIC_RANGES.map(([k]) => k),
  ...ASTEROID_BOOLEAN_FIELDS
]

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
      'winballOverlayAlpha','winballColorTransformIntensity','winballImageWidthPercent','winballImageOffsetXPercent','winballImageOffsetYPercent',
      'winballBumper1Radius','winballBumper1Height','winballBumper1X','winballBumper1Z',
      'winballBumper2Radius','winballBumper2Height','winballBumper2X','winballBumper2Z',
      'winballBumper3Radius','winballBumper3Height','winballBumper3X','winballBumper3Z',
      'winballTriangle1Radius','winballTriangle1Depth','winballTriangle1X','winballTriangle1Z',
      'winballTriangle2Radius','winballTriangle2Depth','winballTriangle2X','winballTriangle2Z',
      'winballPeg1Radius','winballPeg1Height','winballPeg1X','winballPeg1Z',
      'winballPeg2Radius','winballPeg2Height','winballPeg2X','winballPeg2Z',
      'winballPeg3Radius','winballPeg3Height','winballPeg3X','winballPeg3Z',
      'winballPeg4Radius','winballPeg4Height','winballPeg4X','winballPeg4Z',
      'winballPeg5Radius','winballPeg5Height','winballPeg5X','winballPeg5Z',
      'winballPeg6Radius','winballPeg6Height','winballPeg6X','winballPeg6Z',
      'winballPeg7Radius','winballPeg7Height','winballPeg7X','winballPeg7Z',
      'winballPeg8Radius','winballPeg8Height','winballPeg8X','winballPeg8Z',
      'winballPeg9Radius','winballPeg9Height','winballPeg9X','winballPeg9Z',
      'winballPeg10Radius','winballPeg10Height','winballPeg10X','winballPeg10Z',
      'winballPeg11Radius','winballPeg11Height','winballPeg11X','winballPeg11Z',
      'winballPeg12Radius','winballPeg12Height','winballPeg12X','winballPeg12Z'
    ]
    for (const fld of physicsFields) {
      if (payload[fld] != null && typeof payload[fld] !== 'number') {
        throw createError({ statusCode: 400, statusMessage: `"${fld}" must be a number or null` })
      }
    }

  } else if (payload.gameName === 'Clash' || payload.gameName === 'TKO') {
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

  } else if (payload.gameName === 'ReOrbitMatch') {
    if (payload.reorbitPlaysPerPeriod == null || typeof payload.reorbitPlaysPerPeriod !== 'number' || payload.reorbitPlaysPerPeriod < 1) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitPlaysPerPeriod" must be a positive number' })
    }
    if (payload.reorbitPointsPerGame == null || typeof payload.reorbitPointsPerGame !== 'number' || payload.reorbitPointsPerGame < 0) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitPointsPerGame" must be a non-negative number' })
    }
    if (payload.reorbitTimeSeconds != null && (typeof payload.reorbitTimeSeconds !== 'number' || payload.reorbitTimeSeconds < 30)) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitTimeSeconds" must be null or a number >= 30' })
    }
    if (payload.reorbitComboMs == null || typeof payload.reorbitComboMs !== 'number' || payload.reorbitComboMs < 1000 || payload.reorbitComboMs > 15000) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitComboMs" must be a number between 1000 and 15000' })
    }
    if (payload.reorbitGridSize == null || typeof payload.reorbitGridSize !== 'number' || payload.reorbitGridSize < 4 || payload.reorbitGridSize > 10) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitGridSize" must be between 4 and 10' })
    }
    if (!Array.isArray(payload.reorbitEmojis)) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitEmojis" must be an array' })
    }
    const maxEmojis = Math.min(payload.reorbitGridSize, 10)
    if (payload.reorbitEmojis.length > 0 && (payload.reorbitEmojis.length < 4 || payload.reorbitEmojis.length > maxEmojis)) {
      throw createError({ statusCode: 400, statusMessage: `"reorbitEmojis" must have 4–${maxEmojis} items for a ${payload.reorbitGridSize}×${payload.reorbitGridSize} grid` })
    }
    for (const e of payload.reorbitEmojis) {
      if (typeof e !== 'string' || e.trim().length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'Each emoji must be a non-empty string' })
      }
    }
  } else if (payload.gameName === 'TowerStack') {
    if (payload.towerPlaysPerPeriod == null || typeof payload.towerPlaysPerPeriod !== 'number' || payload.towerPlaysPerPeriod < 1) {
      throw createError({ statusCode: 400, statusMessage: '"towerPlaysPerPeriod" must be a positive number' })
    }
    if (payload.towerPointsPerGame == null || typeof payload.towerPointsPerGame !== 'number' || payload.towerPointsPerGame < 0) {
      throw createError({ statusCode: 400, statusMessage: '"towerPointsPerGame" must be a non-negative number' })
    }
    if (payload.towerBaseSpeed == null || typeof payload.towerBaseSpeed !== 'number' || payload.towerBaseSpeed <= 0) {
      throw createError({ statusCode: 400, statusMessage: '"towerBaseSpeed" must be a positive number' })
    }
    if (payload.towerSpeedGrowthPerLayer == null || typeof payload.towerSpeedGrowthPerLayer !== 'number' || payload.towerSpeedGrowthPerLayer < 0) {
      throw createError({ statusCode: 400, statusMessage: '"towerSpeedGrowthPerLayer" must be a non-negative number' })
    }
    if (payload.towerMaxSpeedMultiplier == null || typeof payload.towerMaxSpeedMultiplier !== 'number' || payload.towerMaxSpeedMultiplier < 1) {
      throw createError({ statusCode: 400, statusMessage: '"towerMaxSpeedMultiplier" must be a number >= 1' })
    }
    if (payload.towerPerfectEpsilon == null || typeof payload.towerPerfectEpsilon !== 'number' || payload.towerPerfectEpsilon < 0) {
      throw createError({ statusCode: 400, statusMessage: '"towerPerfectEpsilon" must be a non-negative number' })
    }
    if (payload.towerMaxLayers == null || typeof payload.towerMaxLayers !== 'number' || payload.towerMaxLayers < 10 || payload.towerMaxLayers > 2000) {
      throw createError({ statusCode: 400, statusMessage: '"towerMaxLayers" must be between 10 and 2000' })
    }
  } else if (payload.gameName === 'ReOrbitMemory') {
    if (payload.reorbitMemoryPlaysPerPeriod == null || typeof payload.reorbitMemoryPlaysPerPeriod !== 'number' || payload.reorbitMemoryPlaysPerPeriod < 1) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitMemoryPlaysPerPeriod" must be a positive number' })
    }
    if (payload.reorbitMemoryPointsPerGame == null || typeof payload.reorbitMemoryPointsPerGame !== 'number' || payload.reorbitMemoryPointsPerGame < 0) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitMemoryPointsPerGame" must be a non-negative number' })
    }
    const validPairs = [6, 8, 10, 12]
    if (payload.reorbitMemoryPairs == null || !validPairs.includes(payload.reorbitMemoryPairs)) {
      throw createError({ statusCode: 400, statusMessage: `"reorbitMemoryPairs" must be one of ${validPairs.join(', ')}` })
    }
    if (payload.reorbitMemoryTimeSeconds != null && (typeof payload.reorbitMemoryTimeSeconds !== 'number' || payload.reorbitMemoryTimeSeconds < 30)) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitMemoryTimeSeconds" must be null or a number >= 30' })
    }
    if (payload.reorbitMemoryFlipBackDelayMs == null || typeof payload.reorbitMemoryFlipBackDelayMs !== 'number' || payload.reorbitMemoryFlipBackDelayMs < 300 || payload.reorbitMemoryFlipBackDelayMs > 3000) {
      throw createError({ statusCode: 400, statusMessage: '"reorbitMemoryFlipBackDelayMs" must be between 300 and 3000' })
    }
    if (payload.reorbitMemoryCardBackImagePath != null && typeof payload.reorbitMemoryCardBackImagePath !== 'string') {
      throw createError({ statusCode: 400, statusMessage: '"reorbitMemoryCardBackImagePath" must be a string or null' })
    }
  } else if (payload.gameName === 'OperationAsteroid') {
    // Ranges here MUST stay in sync with normalizeConfig() in lib/asteroidSim.js, which is
    // the last line of defence: it re-clamps everything at /start, so a value that slipped past
    // this check still cannot produce a world the simulation is unstable in.
    for (const [key, lo, hi] of ASTEROID_NUMERIC_RANGES) {
      const v = payload[key]
      if (v == null || typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
        throw createError({ statusCode: 400, statusMessage: `"${key}" must be a number between ${lo} and ${hi}` })
      }
    }
    for (const key of ASTEROID_BOOLEAN_FIELDS) {
      if (typeof payload[key] !== 'boolean') {
        throw createError({ statusCode: 400, statusMessage: `"${key}" must be a boolean` })
      }
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
    // ReOrbitMatch fields
    reorbitPlaysPerPeriod,
    reorbitPointsPerGame,
    reorbitTimeSeconds = null,
    reorbitEmojis = [],
    reorbitGridSize,
    reorbitComboMs,
    // TowerStack fields
    towerPlaysPerPeriod,
    towerPointsPerGame,
    towerBaseSpeed,
    towerSpeedGrowthPerLayer,
    towerMaxSpeedMultiplier,
    towerPerfectEpsilon,
    towerMaxLayers,
    // ReOrbitMemory fields
    reorbitMemoryPlaysPerPeriod,
    reorbitMemoryPointsPerGame,
    reorbitMemoryPairs,
    reorbitMemoryTimeSeconds = null,
    reorbitMemoryFlipBackDelayMs,
    reorbitMemoryCardBackImagePath = null,
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
    winballBumper1Radius = null,
    winballBumper1Height = null,
    winballBumper1X = null,
    winballBumper1Z = null,
    winballBumper2Radius = null,
    winballBumper2Height = null,
    winballBumper2X = null,
    winballBumper2Z = null,
    winballBumper3Radius = null,
    winballBumper3Height = null,
    winballBumper3X = null,
    winballBumper3Z = null,
    winballTriangle1Radius = null,
    winballTriangle1Depth = null,
    winballTriangle1X = null,
    winballTriangle1Z = null,
    winballTriangle2Radius = null,
    winballTriangle2Depth = null,
    winballTriangle2X = null,
    winballTriangle2Z = null,
    winballPeg1Radius = null, winballPeg1Height = null, winballPeg1X = null, winballPeg1Z = null,
    winballPeg2Radius = null, winballPeg2Height = null, winballPeg2X = null, winballPeg2Z = null,
    winballPeg3Radius = null, winballPeg3Height = null, winballPeg3X = null, winballPeg3Z = null,
    winballPeg4Radius = null, winballPeg4Height = null, winballPeg4X = null, winballPeg4Z = null,
    winballPeg5Radius = null, winballPeg5Height = null, winballPeg5X = null, winballPeg5Z = null,
    winballPeg6Radius = null, winballPeg6Height = null, winballPeg6X = null, winballPeg6Z = null,
    winballPeg7Radius = null, winballPeg7Height = null, winballPeg7X = null, winballPeg7Z = null,
    winballPeg8Radius = null, winballPeg8Height = null, winballPeg8X = null, winballPeg8Z = null,
    winballPeg9Radius = null, winballPeg9Height = null, winballPeg9X = null, winballPeg9Z = null,
    winballPeg10Radius = null, winballPeg10Height = null, winballPeg10X = null, winballPeg10Z = null,
    winballPeg11Radius = null, winballPeg11Height = null, winballPeg11X = null, winballPeg11Z = null,
    winballPeg12Radius = null, winballPeg12Height = null, winballPeg12X = null, winballPeg12Z = null,
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
          winballImageOffsetYPercent:  winballImageOffsetYPercent  ?? 0,
          winballBumper1Radius: winballBumper1Radius ?? 6,
          winballBumper1Height: winballBumper1Height ?? 6,
          winballBumper1X:      winballBumper1X      ?? -8,
          winballBumper1Z:      winballBumper1Z      ?? -9,
          winballBumper2Radius: winballBumper2Radius ?? 6,
          winballBumper2Height: winballBumper2Height ?? 6,
          winballBumper2X:      winballBumper2X      ?? -1,
          winballBumper2Z:      winballBumper2Z      ?? 0,
          winballBumper3Radius: winballBumper3Radius ?? 6,
          winballBumper3Height: winballBumper3Height ?? 6,
          winballBumper3X:      winballBumper3X      ?? 6,
          winballBumper3Z:      winballBumper3Z      ?? -9,
          winballTriangle1Radius: winballTriangle1Radius ?? 6,
          winballTriangle1Depth:  winballTriangle1Depth  ?? 6,
          winballTriangle1X:      winballTriangle1X      ?? -15,
          winballTriangle1Z:      winballTriangle1Z      ?? -2,
          winballTriangle2Radius: winballTriangle2Radius ?? 0,
          winballTriangle2Depth:  winballTriangle2Depth  ?? 6,
          winballTriangle2X:      winballTriangle2X      ?? 15,
          winballTriangle2Z:      winballTriangle2Z      ?? -2,
          winballPeg1Radius:  winballPeg1Radius  ?? 1.5, winballPeg1Height:  winballPeg1Height  ?? 4, winballPeg1X:  winballPeg1X  ?? -11, winballPeg1Z:  winballPeg1Z  ?? -17,
          winballPeg2Radius:  winballPeg2Radius  ?? 1.5, winballPeg2Height:  winballPeg2Height  ?? 4, winballPeg2X:  winballPeg2X  ?? -3,  winballPeg2Z:  winballPeg2Z  ?? -17,
          winballPeg3Radius:  winballPeg3Radius  ?? 1.5, winballPeg3Height:  winballPeg3Height  ?? 4, winballPeg3X:  winballPeg3X  ?? 5,   winballPeg3Z:  winballPeg3Z  ?? -17,
          winballPeg4Radius:  winballPeg4Radius  ?? 1.5, winballPeg4Height:  winballPeg4Height  ?? 4, winballPeg4X:  winballPeg4X  ?? 12,  winballPeg4Z:  winballPeg4Z  ?? -17,
          winballPeg5Radius:  winballPeg5Radius  ?? 1.5, winballPeg5Height:  winballPeg5Height  ?? 4, winballPeg5X:  winballPeg5X  ?? -12, winballPeg5Z:  winballPeg5Z  ?? -6,
          winballPeg6Radius:  winballPeg6Radius  ?? 1.5, winballPeg6Height:  winballPeg6Height  ?? 4, winballPeg6X:  winballPeg6X  ?? -5,  winballPeg6Z:  winballPeg6Z  ?? -6,
          winballPeg7Radius:  winballPeg7Radius  ?? 1.5, winballPeg7Height:  winballPeg7Height  ?? 4, winballPeg7X:  winballPeg7X  ?? 2,   winballPeg7Z:  winballPeg7Z  ?? -6,
          winballPeg8Radius:  winballPeg8Radius  ?? 1.5, winballPeg8Height:  winballPeg8Height  ?? 4, winballPeg8X:  winballPeg8X  ?? 10,  winballPeg8Z:  winballPeg8Z  ?? -6,
          winballPeg9Radius:  winballPeg9Radius  ?? 1.5, winballPeg9Height:  winballPeg9Height  ?? 4, winballPeg9X:  winballPeg9X  ?? -12, winballPeg9Z:  winballPeg9Z  ?? 4,
          winballPeg10Radius: winballPeg10Radius ?? 1.5, winballPeg10Height: winballPeg10Height ?? 4, winballPeg10X: winballPeg10X ?? -5,  winballPeg10Z: winballPeg10Z ?? 5,
          winballPeg11Radius: winballPeg11Radius ?? 1.5, winballPeg11Height: winballPeg11Height ?? 4, winballPeg11X: winballPeg11X ?? 3,   winballPeg11Z: winballPeg11Z ?? 4,
          winballPeg12Radius: winballPeg12Radius ?? 1.5, winballPeg12Height: winballPeg12Height ?? 4, winballPeg12X: winballPeg12X ?? 11,  winballPeg12Z: winballPeg12Z ?? 4
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
      } else if (gameName === 'ReOrbitMatch') {
        const reorbitData = {
          reorbitPlaysPerPeriod,
          reorbitPointsPerGame,
          reorbitTimeSeconds: reorbitTimeSeconds || null,
          reorbitEmojis,
          reorbitGridSize,
          reorbitComboMs
        }
        createData = { ...createData, ...reorbitData }
        updateData = { ...updateData, ...reorbitData }
      } else if (gameName === 'TowerStack') {
        const towerData = {
          towerPlaysPerPeriod,
          towerPointsPerGame,
          towerBaseSpeed,
          towerSpeedGrowthPerLayer,
          towerMaxSpeedMultiplier,
          towerPerfectEpsilon,
          towerMaxLayers
        }
        createData = { ...createData, ...towerData }
        updateData = { ...updateData, ...towerData }
      } else if (gameName === 'OperationAsteroid') {
        const asteroidData = {}
        for (const key of ASTEROID_FIELDS) asteroidData[key] = body[key]
        createData = { ...createData, ...asteroidData }
        updateData = { ...updateData, ...asteroidData }
      } else if (gameName === 'ReOrbitMemory') {
        const memoryData = {
          reorbitMemoryPlaysPerPeriod,
          reorbitMemoryPointsPerGame,
          reorbitMemoryPairs,
          reorbitMemoryTimeSeconds: reorbitMemoryTimeSeconds || null,
          reorbitMemoryFlipBackDelayMs,
          reorbitMemoryCardBackImagePath: reorbitMemoryCardBackImagePath || null
        }
        createData = { ...createData, ...memoryData }
        updateData = { ...updateData, ...memoryData }
      } else if (gameName === 'Clash' || gameName === 'TKO') {
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
            ['winballImageOffsetYPercent', before?.winballImageOffsetYPercent, winballImageOffsetYPercent],
            ['winballBumper1Radius', before?.winballBumper1Radius, winballBumper1Radius],
            ['winballBumper1Height', before?.winballBumper1Height, winballBumper1Height],
            ['winballBumper1X', before?.winballBumper1X, winballBumper1X],
            ['winballBumper1Z', before?.winballBumper1Z, winballBumper1Z],
            ['winballBumper2Radius', before?.winballBumper2Radius, winballBumper2Radius],
            ['winballBumper2Height', before?.winballBumper2Height, winballBumper2Height],
            ['winballBumper2X', before?.winballBumper2X, winballBumper2X],
            ['winballBumper2Z', before?.winballBumper2Z, winballBumper2Z],
            ['winballBumper3Radius', before?.winballBumper3Radius, winballBumper3Radius],
            ['winballBumper3Height', before?.winballBumper3Height, winballBumper3Height],
            ['winballBumper3X', before?.winballBumper3X, winballBumper3X],
            ['winballBumper3Z', before?.winballBumper3Z, winballBumper3Z],
            ['winballTriangle1Radius', before?.winballTriangle1Radius, winballTriangle1Radius],
            ['winballTriangle1Depth', before?.winballTriangle1Depth, winballTriangle1Depth],
            ['winballTriangle1X', before?.winballTriangle1X, winballTriangle1X],
            ['winballTriangle1Z', before?.winballTriangle1Z, winballTriangle1Z],
            ['winballTriangle2Radius', before?.winballTriangle2Radius, winballTriangle2Radius],
            ['winballTriangle2Depth', before?.winballTriangle2Depth, winballTriangle2Depth],
            ['winballTriangle2X', before?.winballTriangle2X, winballTriangle2X],
            ['winballTriangle2Z', before?.winballTriangle2Z, winballTriangle2Z],
            ['winballPeg1Radius', before?.winballPeg1Radius, winballPeg1Radius],
            ['winballPeg1Height', before?.winballPeg1Height, winballPeg1Height],
            ['winballPeg1X', before?.winballPeg1X, winballPeg1X],
            ['winballPeg1Z', before?.winballPeg1Z, winballPeg1Z],
            ['winballPeg2Radius', before?.winballPeg2Radius, winballPeg2Radius],
            ['winballPeg2Height', before?.winballPeg2Height, winballPeg2Height],
            ['winballPeg2X', before?.winballPeg2X, winballPeg2X],
            ['winballPeg2Z', before?.winballPeg2Z, winballPeg2Z],
            ['winballPeg3Radius', before?.winballPeg3Radius, winballPeg3Radius],
            ['winballPeg3Height', before?.winballPeg3Height, winballPeg3Height],
            ['winballPeg3X', before?.winballPeg3X, winballPeg3X],
            ['winballPeg3Z', before?.winballPeg3Z, winballPeg3Z],
            ['winballPeg4Radius', before?.winballPeg4Radius, winballPeg4Radius],
            ['winballPeg4Height', before?.winballPeg4Height, winballPeg4Height],
            ['winballPeg4X', before?.winballPeg4X, winballPeg4X],
            ['winballPeg4Z', before?.winballPeg4Z, winballPeg4Z],
            ['winballPeg5Radius', before?.winballPeg5Radius, winballPeg5Radius],
            ['winballPeg5Height', before?.winballPeg5Height, winballPeg5Height],
            ['winballPeg5X', before?.winballPeg5X, winballPeg5X],
            ['winballPeg5Z', before?.winballPeg5Z, winballPeg5Z],
            ['winballPeg6Radius', before?.winballPeg6Radius, winballPeg6Radius],
            ['winballPeg6Height', before?.winballPeg6Height, winballPeg6Height],
            ['winballPeg6X', before?.winballPeg6X, winballPeg6X],
            ['winballPeg6Z', before?.winballPeg6Z, winballPeg6Z],
            ['winballPeg7Radius', before?.winballPeg7Radius, winballPeg7Radius],
            ['winballPeg7Height', before?.winballPeg7Height, winballPeg7Height],
            ['winballPeg7X', before?.winballPeg7X, winballPeg7X],
            ['winballPeg7Z', before?.winballPeg7Z, winballPeg7Z],
            ['winballPeg8Radius', before?.winballPeg8Radius, winballPeg8Radius],
            ['winballPeg8Height', before?.winballPeg8Height, winballPeg8Height],
            ['winballPeg8X', before?.winballPeg8X, winballPeg8X],
            ['winballPeg8Z', before?.winballPeg8Z, winballPeg8Z],
            ['winballPeg9Radius', before?.winballPeg9Radius, winballPeg9Radius],
            ['winballPeg9Height', before?.winballPeg9Height, winballPeg9Height],
            ['winballPeg9X', before?.winballPeg9X, winballPeg9X],
            ['winballPeg9Z', before?.winballPeg9Z, winballPeg9Z],
            ['winballPeg10Radius', before?.winballPeg10Radius, winballPeg10Radius],
            ['winballPeg10Height', before?.winballPeg10Height, winballPeg10Height],
            ['winballPeg10X', before?.winballPeg10X, winballPeg10X],
            ['winballPeg10Z', before?.winballPeg10Z, winballPeg10Z],
            ['winballPeg11Radius', before?.winballPeg11Radius, winballPeg11Radius],
            ['winballPeg11Height', before?.winballPeg11Height, winballPeg11Height],
            ['winballPeg11X', before?.winballPeg11X, winballPeg11X],
            ['winballPeg11Z', before?.winballPeg11Z, winballPeg11Z],
            ['winballPeg12Radius', before?.winballPeg12Radius, winballPeg12Radius],
            ['winballPeg12Height', before?.winballPeg12Height, winballPeg12Height],
            ['winballPeg12X', before?.winballPeg12X, winballPeg12X],
            ['winballPeg12Z', before?.winballPeg12Z, winballPeg12Z]
          ]
          for (const [key, prev, next] of changes) {
            if (prev !== next) await logAdminChange(tx, { userId: me.id, area, key, prevValue: prev, newValue: next })
          }
        } else if (gameName === 'ReOrbitMatch') {
          const changes = [
            ['reorbitPlaysPerPeriod', before?.reorbitPlaysPerPeriod, reorbitPlaysPerPeriod],
            ['reorbitPointsPerGame', before?.reorbitPointsPerGame, reorbitPointsPerGame],
            ['reorbitTimeSeconds', before?.reorbitTimeSeconds ?? null, reorbitTimeSeconds || null],
            ['reorbitGridSize', before?.reorbitGridSize, reorbitGridSize],
            ['reorbitComboMs', before?.reorbitComboMs, reorbitComboMs],
            ['reorbitEmojis', JSON.stringify(before?.reorbitEmojis ?? []), JSON.stringify(reorbitEmojis)]
          ]
          for (const [key, prev, next] of changes) {
            if (String(prev) !== String(next)) {
              await logAdminChange(tx, { userId: me.id, area: 'GameConfig:ReOrbitMatch', key, prevValue: prev, newValue: next })
            }
          }
        } else if (gameName === 'TowerStack') {
          const changes = [
            ['towerPlaysPerPeriod', before?.towerPlaysPerPeriod, towerPlaysPerPeriod],
            ['towerPointsPerGame', before?.towerPointsPerGame, towerPointsPerGame],
            ['towerBaseSpeed', before?.towerBaseSpeed, towerBaseSpeed],
            ['towerSpeedGrowthPerLayer', before?.towerSpeedGrowthPerLayer, towerSpeedGrowthPerLayer],
            ['towerMaxSpeedMultiplier', before?.towerMaxSpeedMultiplier, towerMaxSpeedMultiplier],
            ['towerPerfectEpsilon', before?.towerPerfectEpsilon, towerPerfectEpsilon],
            ['towerMaxLayers', before?.towerMaxLayers, towerMaxLayers]
          ]
          for (const [key, prev, next] of changes) {
            if (prev !== next) {
              await logAdminChange(tx, { userId: me.id, area: 'GameConfig:TowerStack', key, prevValue: prev, newValue: next })
            }
          }
        } else if (gameName === 'OperationAsteroid') {
          for (const key of ASTEROID_FIELDS) {
            const prev = before?.[key]
            const next = body[key]
            if (String(prev) !== String(next)) {
              await logAdminChange(tx, { userId: me.id, area: 'GameConfig:OperationAsteroid', key, prevValue: prev, newValue: next })
            }
          }
        } else if (gameName === 'ReOrbitMemory') {
          const changes = [
            ['reorbitMemoryPlaysPerPeriod', before?.reorbitMemoryPlaysPerPeriod, reorbitMemoryPlaysPerPeriod],
            ['reorbitMemoryPointsPerGame', before?.reorbitMemoryPointsPerGame, reorbitMemoryPointsPerGame],
            ['reorbitMemoryPairs', before?.reorbitMemoryPairs, reorbitMemoryPairs],
            ['reorbitMemoryTimeSeconds', before?.reorbitMemoryTimeSeconds ?? null, reorbitMemoryTimeSeconds || null],
            ['reorbitMemoryFlipBackDelayMs', before?.reorbitMemoryFlipBackDelayMs, reorbitMemoryFlipBackDelayMs],
            ['reorbitMemoryCardBackImagePath', before?.reorbitMemoryCardBackImagePath || null, reorbitMemoryCardBackImagePath || null]
          ]
          for (const [key, prev, next] of changes) {
            if (prev !== next) {
              await logAdminChange(tx, { userId: me.id, area: 'GameConfig:ReOrbitMemory', key, prevValue: prev, newValue: next })
            }
          }
        } else if (gameName === 'Clash' || gameName === 'TKO') {
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
