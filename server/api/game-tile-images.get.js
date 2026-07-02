import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async () => {
  const cfg = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      gameTileWinballImagePath:      true,
      gameTileLottoImagePath:        true,
      gameTileWinwheelImagePath:     true,
      gameTileClashImagePath:        true,
      gameTileTkoImagePath:          true,
      gameTileReorbitmatchImagePath: true
    }
  })

  return {
    winball:      cfg?.gameTileWinballImagePath      ?? null,
    lotto:        cfg?.gameTileLottoImagePath        ?? null,
    winwheel:     cfg?.gameTileWinwheelImagePath     ?? null,
    clash:        cfg?.gameTileClashImagePath        ?? null,
    tko:          cfg?.gameTileTkoImagePath          ?? null,
    reorbitmatch: cfg?.gameTileReorbitmatchImagePath ?? null
  }
})
