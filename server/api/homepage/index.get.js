import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async () => {
  const cfg = await db.homepageConfig.findUnique({ where: { id: 'homepage' } })
  return {
    topLeftImagePath:     cfg?.topLeftImagePath     ?? null,
    bottomLeftImagePath:  cfg?.bottomLeftImagePath  ?? null,
    topRightImagePath:    cfg?.topRightImagePath    ?? null,
    bottomRightImagePath: cfg?.bottomRightImagePath ?? null,
    showcaseImagePath:    cfg?.showcaseImagePath ?? null,
  }
})
