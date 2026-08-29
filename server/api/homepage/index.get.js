import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

// If a slot is an mp4, check for a generated poster image (same base name, .jpg)
async function posterPathFor(videoPath) {
  try {
    const sp = videoPath || ''
    if (!sp || !/\.mp4($|\?)/i.test(sp)) return null
    const base = (sp.split('?')[0] || '').split('/').pop() || ''
    const posterFilename = base.replace(/\.mp4$/i, '.jpg')
    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'homepage')
      : join(baseDir, 'public', 'homepage')
    const cand = join(uploadDir, posterFilename)
    await access(cand)
    return process.env.NODE_ENV === 'production' ? `/images/homepage/${posterFilename}` : `/homepage/${posterFilename}`
  } catch (e) {
    return null // poster not found -- that's fine
  }
}

export default defineEventHandler(async () => {
  const cfg = await db.homepageConfig.findUnique({ where: { id: 'homepage' } })
  const heroVideoPosterPath = await posterPathFor(cfg?.heroVideoPath)
  return {
    topLeftImagePath:        cfg?.topLeftImagePath        ?? null,
    bottomLeftImagePath:     cfg?.bottomLeftImagePath     ?? null,
    topRightImagePath:       cfg?.topRightImagePath       ?? null,
    bottomRightImagePath:    cfg?.bottomRightImagePath    ?? null,
    bottomRightLink:         cfg?.bottomRightLink         ?? null,
    showcaseImagePath:       cfg?.showcaseImagePath       ?? null,
    heroImagePath:           cfg?.heroImagePath           ?? null,
    heroImageLink:           cfg?.heroImageLink           ?? null,
    heroVideoPath:           cfg?.heroVideoPath           ?? null,
    heroVideoPosterPath:     heroVideoPosterPath          ?? null,
    loginTopImagePath:       cfg?.loginTopImagePath       ?? null,
    loginTopImageLink:       cfg?.loginTopImageLink       ?? null,
    loginBottomImagePath:    cfg?.loginBottomImagePath    ?? null,
    loginBottomImageLink:    cfg?.loginBottomImageLink    ?? null,
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
