// server/api/admin/avatars.post.js — upload a new restricted/exclusive avatar into the Avatar
// catalog, for use as a cMoon affinity level reward.
//
// Written directly into public/avatars (NOT the uploadStorage.js CDN-split convention used by
// Background/cMoon uploads) so it's served at the same `/avatars/<filename>` URL the existing
// free-for-all avatar files use — server/api/avatars.get.js and pages/newsite/settings.vue's
// <img :src="`/avatars/${img}`"> both assume every avatar lives under that one path. Validation
// mirrors server/api/admin/cmoons/[id]/image.post.js: content-length pre-check, magic-byte
// sniffing (never the client-declared mime type), re-encoded through sharp, server-generated
// filename only.
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { MAX_IMAGE_BYTES, sniffImageType } from '@/server/utils/imageUploadValidation'

// Square icon, matches how avatars render everywhere they're used (cMoon top-members list,
// settings picker, etc.) — re-encoding to a fixed size means any reasonably-sized source works.
const OUTPUT_SIZE = 256
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES + 64 * 1024

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (contentLength > MAX_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Image file is required.' })
  if (filePart.data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 5MB or smaller' })
  }

  const labelPart = parts.find(p => p.name === 'label' && !p.filename)
  const label = labelPart ? Buffer.from(labelPart.data).toString('utf-8').trim().slice(0, 100) || null : null

  const sniffed = sniffImageType(filePart.data)
  if (!sniffed || !ALLOWED_TYPES.includes(sniffed)) {
    throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, or WebP images are allowed' })
  }

  let output
  try {
    output = await sharp(filePart.data, { limitInputPixels: 40_000_000 })
      .timeout({ seconds: 15 })
      .resize({ width: OUTPUT_SIZE, height: OUTPUT_SIZE, fit: 'cover', position: 'attention' })
      .png()
      .toBuffer()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not process that image' })
  }

  const dir = path.resolve('public/avatars')
  await mkdir(dir, { recursive: true })

  // Server-generated name only — never the client's filename or extension.
  const filename = `affinity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  await writeFile(path.join(dir, filename), output)
  const imagePath = `/avatars/${filename}`

  const created = await db.avatar.create({
    data: { label, filename, imagePath, width: OUTPUT_SIZE, height: OUTPUT_SIZE, mimeType: 'image/png', createdById: me.id },
  })

  await logAdminChange(db, { userId: me.id, area: 'Avatar', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, filename } })

  return { id: created.id, filename: created.filename, imagePath: created.imagePath, label: created.label }
})
