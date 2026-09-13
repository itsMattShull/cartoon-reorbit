// server/api/admin/global-config/certificate-logo.post.js
// Uploads the logo shown on the player membership certificate (Settings >
// Generate Certificate). Written through the same admin-upload path every
// other site-wide image uses — a plain git-committed file under public/
// never actually reaches production/dev, since /images/* is served from the
// sibling cartoon-reorbit-images/ directory instead (see uploadStorage.js).
import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { uploadDir, uploadPublicPath } from '@/server/utils/uploadStorage'

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_INPUT_PIXELS = 30_000_000 // guards against decompression-bomb-style crafted images
const FEATURE = 'certificate'

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  // 2) Parse multipart
  const parts = await readMultipartFormData(event)
  let imagePart = null
  for (const part of parts || []) {
    if (part.filename && part.name === 'image') imagePart = part
  }
  if (!imagePart) throw createError({ statusCode: 400, statusMessage: 'Image required.' })
  if (!ALLOWED_TYPES.has(imagePart.type)) {
    throw createError({ statusCode: 400, statusMessage: 'PNG, JPG, or WEBP only.' })
  }
  if (!imagePart.data || imagePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Image must be 5MB or smaller.' })
  }

  // 3) Decode + auto-orient (EXIF), normalize to PNG. This also fails closed on anything
  // sharp can't parse, rejecting mismatched/spoofed Content-Type since sharp sniffs the
  // real file header rather than trusting it.
  let pngBuffer
  try {
    pngBuffer = await sharp(imagePart.data, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .png()
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not read image — file may be corrupt, too large, or an unsupported format.' })
  }

  // 4) Save with a server-generated filename — never trust the client filename/path. The
  // timestamp also naturally cache-busts every reupload, no separate version counter needed.
  const filename = `logo-${Date.now()}.png`
  const dir = uploadDir(FEATURE)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), pngBuffer)
  const assetPath = uploadPublicPath(FEATURE, filename)

  // 5) Persist to the singleton global config row
  const before = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  await prisma.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', certificateLogoPath: assetPath },
    update: { certificateLogoPath: assetPath }
  })

  try {
    await logAdminChange(prisma, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: 'certificateLogoPath',
      prevValue: before?.certificateLogoPath ?? null,
      newValue: assetPath
    })
  } catch {}

  // Best-effort cleanup of the previous upload so these don't accumulate on disk indefinitely.
  if (before?.certificateLogoPath && before.certificateLogoPath !== assetPath) {
    const prevFilename = before.certificateLogoPath.split('/').pop()
    if (prevFilename) await rm(join(dir, prevFilename), { force: true }).catch(() => {})
  }

  return { certificateLogoPath: assetPath }
})
