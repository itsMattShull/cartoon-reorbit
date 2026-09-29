// server/api/admin/cmoon-enemy-factions/[id]/music.post.js
// Uploads (or replaces) a faction's looping battle music — see CMoonEnemyFaction.battleMusicPath's
// own schema comment for exactly when it plays. Single-target sibling of
// cmoon-enemy-members/[id]/sound.post.js's slot-based endpoint (a faction only ever has this one
// audio field, so no slot selector is needed here) — same magic-byte validation discipline as
// every other audio upload in this codebase (see server/utils/audioUploadValidation.js).
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor, MAX_AUDIO_BYTES } from '@/server/utils/audioUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'cmoon-enemy-factions'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const faction = await db.cMoonEnemyFaction.findUnique({ where: { id } })
  if (!faction) throw createError({ statusCode: 404, statusMessage: 'Enemy faction not found' })

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

  const filename = `cmoon-enemy-faction-music-${id}-${Date.now()}${audioExtFor(sniffed)}`
  const outPath = assertInside(dir, uploadFsPath(FEATURE, filename))
  await writeFile(outPath, filePart.data)
  const newPath = uploadPublicPath(FEATURE, filename)

  const oldPath = faction.battleMusicPath
  await db.cMoonEnemyFaction.update({ where: { id }, data: { battleMusicPath: newPath } })

  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyFaction', key: `battleMusic:${id}`, prevValue: oldPath, newValue: newPath })

  return { battleMusicPath: newPath }
})
