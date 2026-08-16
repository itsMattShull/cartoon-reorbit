// server/api/admin/winwheel-sound.post.js
//
// Hardened during the Pokemon: Fire, Water, Grass! work, which needed an audio upload and
// found this one was not a safe pattern to copy. Three defects, all fixed here:
//
//   1. The allowlist tested `filePart.type` — the multipart Content-Type, which the client
//      writes and can set to anything. Now the type comes from the file's magic bytes.
//   2. The saved extension came from `extname(filePart.filename)`, also client-supplied. In
//      production nginx serves this directory and derives Content-Type from the extension, so
//      a request declaring `audio/mpeg` while naming its file `x.html` wrote an HTML document
//      served as text/html from this site's own origin — stored XSS, with no CSP to contain
//      it. The extension is now looked up from the sniffed type.
//   3. There was no size limit at all, so this was an authenticated unbounded-disk-write.
//
// There was also a latent path traversal: the `label` form field was interpolated into the
// filename, guarded only by `typeof p.data === 'string'` — which is never true, because h3's
// readMultipartFormData returns a Buffer for every part, file or field. That check was the
// only thing preventing `label = '../../../.output/server/chunks/x'` with a `.js` extension.
// The field is gone entirely rather than sanitised: the filename is now built wholly from
// server-controlled values, which is the only version of this that stays safe under editing.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor, MAX_AUDIO_BYTES } from '@/server/utils/audioUploadValidation'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

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

  const sniffed = sniffAudioType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only MP3, OGG or WAV audio is allowed' })
  }

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'winwheel')
    : join(baseDir, 'public', 'winwheel')
  await mkdir(uploadDir, { recursive: true })

  // Every component is server-controlled: a fixed literal, a clock reading, and an extension
  // looked up from the sniffed type. Nothing the client sent appears here.
  const filename = `winwheel-sound-${Date.now()}${audioExtFor(sniffed)}`
  const outPath = assertInside(uploadDir, join(uploadDir, filename))
  await writeFile(outPath, filePart.data)

  const assetPath = process.env.NODE_ENV === 'production'
    ? `/images/winwheel/${filename}`
    : `/winwheel/${filename}`

  try {
    const before = await db.gameConfig.findUnique({
      where: { gameName: 'Winwheel' },
      select: { winWheelSoundPath: true }
    })
    await db.gameConfig.upsert({
      where: { gameName: 'Winwheel' },
      create: { gameName: 'Winwheel', winWheelSoundPath: assetPath },
      update: { winWheelSoundPath: assetPath, updatedAt: new Date() }
    })
    if ((before?.winWheelSoundPath || null) !== assetPath) {
      await logAdminChange(db, {
        userId: me.id,
        area: 'GameConfig:Winwheel',
        key: 'winWheelSoundPath',
        prevValue: before?.winWheelSoundPath || null,
        newValue: assetPath
      })
    }
  } catch (err) {
    console.error('Failed to update winWheelSoundPath on GameConfig:', err)
    throw createError({ statusCode: 500, statusMessage: 'Audio saved, but updating config failed' })
  }

  return { assetPath }
})
