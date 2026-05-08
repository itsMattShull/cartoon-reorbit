import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async () => {
  const cfg = await db.homepageConfig.findUnique({ where: { id: 'homepage' } })
  return {
    topLeftImagePath:        cfg?.topLeftImagePath        ?? null,
    bottomLeftImagePath:     cfg?.bottomLeftImagePath     ?? null,
    topRightImagePath:       cfg?.topRightImagePath       ?? null,
    bottomRightImagePath:    cfg?.bottomRightImagePath    ?? null,
    bottomRightLink:         cfg?.bottomRightLink         ?? null,
    showcaseImagePath:       cfg?.showcaseImagePath       ?? null,
    homeImage1Path:          cfg?.homeImage1Path          ?? null,
    homeImage1Link:          cfg?.homeImage1Link          ?? null,
    homeImage2Path:          cfg?.homeImage2Path          ?? null,
    homeImage2Link:          cfg?.homeImage2Link          ?? null,
    homeImage3Path:          cfg?.homeImage3Path          ?? null,
    homeImage3Link:          cfg?.homeImage3Link          ?? null,
    homeImage4Path:          cfg?.homeImage4Path          ?? null,
    homeImage4Link:          cfg?.homeImage4Link          ?? null,
    middleSidebar1ImagePath: cfg?.middleSidebar1ImagePath ?? null,
    middleSidebar1Link:      cfg?.middleSidebar1Link      ?? null,
    middleSidebar2ImagePath: cfg?.middleSidebar2ImagePath ?? null,
    middleSidebar2Link:      cfg?.middleSidebar2Link      ?? null,
    middleSidebar3ImagePath: cfg?.middleSidebar3ImagePath ?? null,
    middleSidebar3Link:      cfg?.middleSidebar3Link      ?? null,
    newsImagePath:           cfg?.newsImagePath           ?? null,
    earnPointsImagePath:     cfg?.earnPointsImagePath     ?? null,
    labelImagePath:          cfg?.labelImagePath          ?? null,
  }
})
