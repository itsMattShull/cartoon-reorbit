// server/api/admin/global-config/ui-sounds.post.js
//
// Uploads a new sound into the reusable "haptic sound" library (see prisma/schema.prisma's
// UiSound model comment). Uploading here does NOT assign the sound anywhere — that's a
// separate step via server/api/admin/global-config/nav-sounds.post.js, so an admin can build up
// a library and try assignments without every upload immediately going live.
//
// Validation is the same discipline as the site-wide default sound this replaces: magic-byte
// sniffing (server/utils/audioUploadValidation.js) rather than trusting Content-Type, a
// wholly server-generated filename, and a duration cap — this can end up assigned to the
// site-wide default slot, which plays on every click sitewide, so a multi-minute file is a real
// per-click DoS/annoyance risk in a way a one-off game sound isn't.
import {
  defineEventHandler,
  readMultipartFormData,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBuffer } from 'music-metadata'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor, MAX_AUDIO_BYTES } from '@/server/utils/audioUploadValidation'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

// A UI click blip has no legitimate reason to run long. 3 seconds is generous headroom over
// the ~0.2s bundled default while still ruling out anything that could meaningfully overlap
// itself on rapid clicking.
const MAX_DURATION_SECONDS = 3
const MAX_LABEL_LENGTH = 60

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing audio file' })
  if (filePart.data.length > MAX_AUDIO_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Audio must be 3MB or smaller' })
  }

  const labelPart = parts.find(p => p.name === 'label' && !p.filename)
  const label = (labelPart?.data?.toString('utf8') || '').trim().slice(0, MAX_LABEL_LENGTH)
  if (!label) throw createError({ statusCode: 400, statusMessage: 'Label is required' })

  const sniffed = sniffAudioType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only MP3, OGG or WAV audio is allowed' })
  }

  let durationSeconds
  try {
    const metadata = await parseBuffer(filePart.data, sniffed)
    durationSeconds = metadata?.format?.duration
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not read audio — file may be corrupt' })
  }
  if (!durationSeconds || !Number.isFinite(durationSeconds)) {
    throw createError({ statusCode: 400, statusMessage: 'Could not determine audio duration' })
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    throw createError({ statusCode: 400, statusMessage: `Click sound must be ${MAX_DURATION_SECONDS} seconds or shorter` })
  }

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'ui-sounds')
    : join(baseDir, 'public', 'ui-sounds')
  await mkdir(uploadDir, { recursive: true })

  // Every component is server-controlled: a fixed literal, a clock reading, and an extension
  // looked up from the sniffed type. Nothing the client sent appears here.
  const filename = `ui-sound-${Date.now()}${audioExtFor(sniffed)}`
  const outPath = assertInside(uploadDir, join(uploadDir, filename))
  await writeFile(outPath, filePart.data)

  const path = process.env.NODE_ENV === 'production'
    ? `/images/ui-sounds/${filename}`
    : `/ui-sounds/${filename}`

  const sound = await db.uiSound.create({ data: { label, path } })

  try {
    await logAdminChange(db, {
      userId: me.id,
      area: 'UiSound',
      key: sound.id,
      prevValue: null,
      newValue: `${label} (${path})`
    })
  } catch {}

  return { id: sound.id, label: sound.label, path: sound.path, createdAt: sound.createdAt }
})
