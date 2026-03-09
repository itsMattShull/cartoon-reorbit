// server/api/winball-config.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

const DEFAULTS = {
  // Colors
  winballColorBackground: '#ffffff',
  winballColorBackboard:  '#F0E6FF',
  winballColorWalls:      '#4b4b4b',
  winballColorBall:       '#ff0000',
  winballColorBumpers:    '#8c8cff',
  winballColorLeftCup:    '#8c8cff',
  winballColorRightCup:   '#8c8cff',
  winballColorGoldCup:    '#FFD700',
  winballColorCap:        '#ffd000',
  winballColorTransform:  '#ffffff',
  winballColorTransformIntensity: 0,
  winballOverlayColor:    '#ffffff',
  winballOverlayAlpha:    0,
  winballImageWidthPercent: 100,
  winballImageOffsetXPercent: 0,
  winballImageOffsetYPercent: 0,
  winballBackboardImagePath: null,
  winballBumper1ImagePath:   null,
  winballBumper2ImagePath:   null,
  winballBumper3ImagePath:   null,
  // Bumper geometry
  winballBumper1Radius: 6,
  winballBumper1Height: 6,
  winballBumper1X:      -8,
  winballBumper1Z:      -9,
  winballBumper2Radius: 6,
  winballBumper2Height: 6,
  winballBumper2X:      -1,
  winballBumper2Z:      0,
  winballBumper3Radius: 6,
  winballBumper3Height: 6,
  winballBumper3X:      6,
  winballBumper3Z:      -9,
  // Triangle geometry
  winballTriangle1Radius: 6,
  winballTriangle1Depth:  6,
  winballTriangle1X:      -15,
  winballTriangle1Z:      -2,
  winballTriangle2Radius: 0,
  winballTriangle2Depth:  6,
  winballTriangle2X:      15,
  winballTriangle2Z:      -2,
  // Physics
  winballGravity:             15,
  winballBallMass:            8,
  winballBallLinearDamping:   0.2,
  winballBallAngularDamping:  0,
  winballBallWallRestitution: 1.2,
  winballPlungerMaxPull:      0.6,
  winballPlungerImpactFactor: 0.2,
  winballPlungerForce:        500
}

export default defineEventHandler(async () => {
  const config = await db.gameConfig.findUnique({
    where: { gameName: 'Winball' },
    select: {
      winballColorBackground:     true,
      winballColorBackboard:      true,
      winballColorWalls:          true,
      winballColorBall:           true,
      winballColorBumpers:        true,
      winballColorLeftCup:        true,
      winballColorRightCup:       true,
      winballColorGoldCup:        true,
      winballColorCap:            true,
      winballColorTransform:      true,
      winballColorTransformIntensity: true,
      winballOverlayColor:        true,
      winballOverlayAlpha:        true,
      winballImageWidthPercent:   true,
      winballImageOffsetXPercent: true,
      winballImageOffsetYPercent: true,
      winballBackboardImagePath:  true,
      winballBumper1ImagePath:    true,
      winballBumper2ImagePath:    true,
      winballBumper3ImagePath:    true,
      winballBumper1Radius:       true,
      winballBumper1Height:       true,
      winballBumper1X:            true,
      winballBumper1Z:            true,
      winballBumper2Radius:       true,
      winballBumper2Height:       true,
      winballBumper2X:            true,
      winballBumper2Z:            true,
      winballBumper3Radius:       true,
      winballBumper3Height:       true,
      winballBumper3X:            true,
      winballBumper3Z:            true,
      winballTriangle1Radius:     true,
      winballTriangle1Depth:      true,
      winballTriangle1X:          true,
      winballTriangle1Z:          true,
      winballTriangle2Radius:     true,
      winballTriangle2Depth:      true,
      winballTriangle2X:          true,
      winballTriangle2Z:          true,
      winballGravity:             true,
      winballBallMass:            true,
      winballBallLinearDamping:   true,
      winballBallAngularDamping:  true,
      winballBallWallRestitution: true,
      winballPlungerMaxPull:      true,
      winballPlungerImpactFactor: true,
      winballPlungerForce:        true
    }
  })

  // Merge db values over defaults so null/missing fields fall back to defaults
  return { ...DEFAULTS, ...Object.fromEntries(
    Object.entries(config || {}).filter(([, v]) => v != null)
  )}
})
