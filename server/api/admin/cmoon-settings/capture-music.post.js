// server/api/admin/cmoon-settings/capture-music.post.js
// Uploads (or replaces) the ONE site-wide "capture music" track, played the instant any cMoon
// enemy is captured (see GlobalGameConfig.cMoonEnemyCaptureMusicPath's own schema comment) —
// universal regardless of faction, unlike CMoonEnemyMember's own per-enemy appear/victory/defeat
// sound paths, so this lives on the singleton global config row rather than any per-row model.
// Filed under cmoon-settings rather than global-config: the latter's writes are permission-gated
// to 'globalSettings' only (see utils/adminPermissions.js's WRITE_ONLY_PERMS comment), but this
// control only ever appears in AdminCMoonEnemies.vue, a 'cMoonEnemies'-gated page — cmoon-settings
// already grants that permission write access to the same GlobalGameConfig singleton.
// Same magic-byte-sniffed audio discipline as every other audio upload in this codebase (see
// cmoon-special-attacks/[id]/sound.post.js).
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor, MAX_AUDIO_BYTES } from '@/server/utils/audioUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'cmoon-settings'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const filePart = parts.find(p => p.filename)
  if (!filePart) throw createError({ statusCode: 400, statusMessage: 'Audio file is required.' })
  if (filePart.data.length > MAX_AUDIO_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Audio must be 3MB or smaller' })
  }

  const sniffed = sniffAudioType(filePart.data)
  if (!sniffed) {
    throw createError({ statusCode: 400, statusMessage: 'Only MP3, OGG, or WAV audio is allowed' })
  }

  const dir = uploadDir(FEATURE)
  await mkdir(dir, { recursive: true })

  const filename = `cmoon-capture-music-${Date.now()}${audioExtFor(sniffed)}`
  const outPath = assertInside(dir, uploadFsPath(FEATURE, filename))
  await writeFile(outPath, filePart.data)
  const newPath = uploadPublicPath(FEATURE, filename)

  const before = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const updated = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', cMoonEnemyCaptureMusicPath: newPath },
    update: { cMoonEnemyCaptureMusicPath: newPath },
  })

  const oldPath = before?.cMoonEnemyCaptureMusicPath
  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  try {
    await logAdminChange(db, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: 'cMoonEnemyCaptureMusicPath',
      prevValue: oldPath ?? null,
      newValue: updated.cMoonEnemyCaptureMusicPath,
    })
  } catch {}

  return { cMoonEnemyCaptureMusicPath: updated.cMoonEnemyCaptureMusicPath }
})
