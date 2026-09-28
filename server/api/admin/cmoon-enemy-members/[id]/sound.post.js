// server/api/admin/cmoon-enemy-members/[id]/sound.post.js
// Uploads one of an enemy member's six battle sound effects (appear / damage-taken /
// damage-avoided / attacking / victory / defeat — see each column's own comment on
// CMoonEnemyMember in prisma/schema.prisma for exactly when it plays). One endpoint for all six,
// selected via the `slot` form field, rather than six near-identical endpoints — same rationale
// as image.post.js handling both static and animated portraits in one place.
//
// `slot` is checked against MEMBER_SOUND_SLOTS (server/utils/cmoonEnemy.js) before it ever
// reaches Prisma's `data` object — never interpolate a client-sent field name straight into an
// update payload, that's how an arbitrary body key could overwrite an unrelated column.
//
// Audio validation follows server/utils/audioUploadValidation.js's rule, the same one
// server/api/admin/winwheel-sound.post.js was hardened to: the type comes from the file's magic
// bytes, the saved extension comes from the sniffed type, and nothing the client sent (filename,
// declared Content-Type) ever reaches the filename on disk.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor, MAX_AUDIO_BYTES } from '@/server/utils/audioUploadValidation'
import { MEMBER_SOUND_SLOTS } from '@/server/utils/cmoonEnemy'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'cmoon-enemy-members'
const SLOTS = new Set(MEMBER_SOUND_SLOTS)

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({ where: { id } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const parts = await readMultipartFormData(event)
  if (!parts?.length) throw createError({ statusCode: 400, statusMessage: 'No form data' })

  const slotPart = parts.find(p => !p.filename && p.name === 'slot')
  const slot = slotPart
    ? (Buffer.isBuffer(slotPart.data) ? slotPart.data.toString('utf-8') : String(slotPart.data)).trim()
    : ''
  if (!SLOTS.has(slot)) throw createError({ statusCode: 400, statusMessage: 'Invalid sound slot' })

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

  // Server-generated name only — the `slot` value reaching this point is already constrained to
  // one of the six known column names by the SLOTS check above, so it's safe to fold into the
  // filename too.
  const filename = `cmoon-enemy-member-sound-${slot}-${id}-${Date.now()}${audioExtFor(sniffed)}`
  const outPath = assertInside(dir, uploadFsPath(FEATURE, filename))
  await writeFile(outPath, filePart.data)
  const newPath = uploadPublicPath(FEATURE, filename)

  const oldPath = member[slot]
  await db.cMoonEnemyMember.update({ where: { id }, data: { [slot]: newPath } })

  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyMember', key: `sound:${slot}:${id}`, prevValue: oldPath, newValue: newPath })

  return { slot, soundPath: newPath }
})
