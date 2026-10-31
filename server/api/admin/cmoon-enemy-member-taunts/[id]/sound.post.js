// server/api/admin/cmoon-enemy-member-taunts/[id]/sound.post.js — uploads a member taunt's one
// optional sound. Mirrors cmoon-enemy-taunts/[id]/sound.post.js exactly: no `slot` to pick (one
// soundPath column), same magic-byte sniffing discipline as every other audio upload in this
// codebase — never trusted from the client's declared content-type or filename extension.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor, MAX_AUDIO_BYTES } from '@/server/utils/audioUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'cmoon-enemy-member-taunts'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const taunt = await db.cMoonEnemyMemberTaunt.findUnique({ where: { id } })
  if (!taunt) throw createError({ statusCode: 404, statusMessage: 'Taunt not found' })

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(p => p.filename)
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

  const filename = `cmoon-enemy-member-taunt-sound-${id}-${Date.now()}${audioExtFor(sniffed)}`
  const outPath = assertInside(dir, uploadFsPath(FEATURE, filename))
  await writeFile(outPath, filePart.data)
  const newPath = uploadPublicPath(FEATURE, filename)

  const oldPath = taunt.soundPath
  await db.cMoonEnemyMemberTaunt.update({ where: { id }, data: { soundPath: newPath } })

  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyMemberTaunt', key: `sound:${id}`, prevValue: oldPath, newValue: newPath })

  return { soundPath: newPath }
})
