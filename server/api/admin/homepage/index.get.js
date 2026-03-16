import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const cfg = await db.homepageConfig.findUnique({ where: { id: 'homepage' } })
  const cfgSafe = cfg ?? {
    id: 'homepage',
    topLeftImagePath: null,
    bottomLeftImagePath: null,
    topRightImagePath: null,
    bottomRightImagePath: null,
    showcaseImagePath: null,
    updatedAt: null
  }

  // If showcase is an mp4, check for a generated poster image (same base name, .jpg)
  let showcasePosterPath = null
  try {
    const sp = cfgSafe.showcaseImagePath || ''
    if (sp && /\.mp4($|\?)/i.test(sp)) {
      const base = (sp.split('?')[0] || '').split('/').pop() || ''
      const posterFilename = base.replace(/\.mp4$/i, '.jpg')
      const uploadDir = process.env.NODE_ENV === 'production'
        ? join(baseDir, 'cartoon-reorbit-images', 'homepage')
        : join(baseDir, 'public', 'homepage')
      const cand = join(uploadDir, posterFilename)
      await access(cand)
      showcasePosterPath = process.env.NODE_ENV === 'production' ? `/images/homepage/${posterFilename}` : `/homepage/${posterFilename}`
    }
  } catch (e) {
    // poster not found -- that's fine
  }

  return { ...cfgSafe, showcasePosterPath }
})
