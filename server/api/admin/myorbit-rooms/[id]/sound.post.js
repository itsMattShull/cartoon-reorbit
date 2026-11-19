// Uploads a room's looping ambience track — purely cosmetic, started/stopped client-side on
// join/leave (see composables/useMyOrbitSocket.js / components/MyOrbitWindow.vue). Same
// magic-byte validation and dedicated-endpoint shape as every other audio upload in this admin
// console (e.g. server/api/admin/cmoon-enemy-factions/[id]/sound.post.js) — never folded into the
// plain-JSON room metadata PUT, same convention every other per-entity media path follows.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor, MAX_AUDIO_BYTES } from '@/server/utils/audioUploadValidation'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'myorbit-rooms'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const room = await db.myOrbitRoom.findUnique({ where: { id } })
  if (!room) throw createError({ statusCode: 404, statusMessage: 'Room not found' })

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

  const filename = `myorbit-room-sound-${id}-${Date.now()}${audioExtFor(sniffed)}`
  const outPath = assertInside(dir, uploadFsPath(FEATURE, filename))
  await writeFile(outPath, filePart.data)
  const newPath = uploadPublicPath(FEATURE, filename)

  const oldPath = room.ambientSoundPath
  await db.myOrbitRoom.update({ where: { id }, data: { ambientSoundPath: newPath } })

  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, { userId: me.id, area: 'MyOrbitRoom', key: `ambientSound:${id}`, prevValue: oldPath, newValue: newPath })

  return { ambientSoundPath: newPath }
})
