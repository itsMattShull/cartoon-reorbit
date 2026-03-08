// server/api/winball-config.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

const DEFAULTS = {
  winballColorBackground: '#ffffff',
  winballColorBackboard:  '#F0E6FF',
  winballColorWalls:      '#4b4b4b',
  winballColorBall:       '#ff0000',
  winballColorBumpers:    '#8c8cff',
  winballColorLeftCup:    '#8c8cff',
  winballColorRightCup:   '#8c8cff',
  winballColorGoldCup:    '#FFD700',
  winballColorCap:        '#ffd000'
}

export default defineEventHandler(async () => {
  const config = await db.gameConfig.findUnique({
    where: { gameName: 'Winball' },
    select: {
      winballColorBackground: true,
      winballColorBackboard:  true,
      winballColorWalls:      true,
      winballColorBall:       true,
      winballColorBumpers:    true,
      winballColorLeftCup:    true,
      winballColorRightCup:   true,
      winballColorGoldCup:    true,
      winballColorCap:        true
    }
  })

  // Merge db values over defaults so null/missing fields fall back to defaults
  return { ...DEFAULTS, ...Object.fromEntries(
    Object.entries(config || {}).filter(([, v]) => v != null)
  )}
})
