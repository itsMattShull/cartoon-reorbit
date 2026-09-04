// server/api/admin/global-config/ui-click-sound.post.js
//
// Uploads (or clears) the site-wide UI "haptic sound" — the short click blip that plays on
// every button click, sitewide, for every visitor (see composables/useClickSoundEffects.js).
//
// Copied from the already-hardened server/api/admin/winwheel-sound.post.js: magic-byte
// sniffing via server/utils/audioUploadValidation.js, a size cap, and a wholly
// server-generated filename — nothing client-supplied reaches the filesystem path. See that
// file's header comment for the stored-XSS history this guards against (there is no CSP on
// this site at all, so the extension-from-sniffed-type discipline is load-bearing, not
// decorative).
//
// One addition beyond winwheel-sound.post.js: a duration check. Winwheel's sound only ever
// plays once, inside one specific game action. This one fires from a single delegated click
// handler on every button click across the whole site, so a multi-minute (or silently
// looping) file here is a real per-click DoS/annoyance risk in a way winwheel's isn't — a
// "click sound" has no legitimate reason to run past a couple of seconds.
import {
  defineEventHandler,
  readMultipartFormData,
  createError
} from 'h3'
import { mkdir, writeFile, rm } from 'node:fs/promises'
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

const UPLOAD_PREFIX = 'ui-click-sound-'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const filePart = parts.find(p => p.filename)
  const clearPart = parts.find(p => p.name === 'clear')
  const isClear = !filePart && clearPart?.data?.toString('utf8') === '1'

  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'ui-sounds')
    : join(baseDir, 'public', 'ui-sounds')

  const before = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { uiClickSoundPath: true }
  })

  let newPath = null

  if (!isClear) {
    if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Missing audio file' })
    if (filePart.data.length > MAX_AUDIO_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Audio must be 3MB or smaller' })
    }

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

    await mkdir(uploadDir, { recursive: true })

    // Every component is server-controlled: a fixed literal, a clock reading, and an
    // extension looked up from the sniffed type. Nothing the client sent appears here.
    const filename = `${UPLOAD_PREFIX}${Date.now()}${audioExtFor(sniffed)}`
    const outPath = assertInside(uploadDir, join(uploadDir, filename))
    await writeFile(outPath, filePart.data)

    newPath = process.env.NODE_ENV === 'production'
      ? `/images/ui-sounds/${filename}`
      : `/ui-sounds/${filename}`
  }

  await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', uiClickSoundPath: newPath },
    update: { uiClickSoundPath: newPath }
  })

  if ((before?.uiClickSoundPath || null) !== newPath) {
    try {
      await logAdminChange(db, {
        userId: me.id,
        area: 'GlobalGameConfig',
        key: 'uiClickSoundPath',
        prevValue: before?.uiClickSoundPath || null,
        newValue: newPath
      })
    } catch {}
  }

  // Best-effort cleanup of the previous uploaded file — never touches the bundled default,
  // which doesn't live under this prefix.
  if (before?.uiClickSoundPath?.includes(UPLOAD_PREFIX)) {
    const prevFilename = before.uiClickSoundPath.split('/').pop()
    if (prevFilename && prevFilename !== newPath?.split('/').pop()) {
      await rm(join(uploadDir, prevFilename), { force: true }).catch(() => {})
    }
  }

  return { uiClickSoundPath: newPath }
})
