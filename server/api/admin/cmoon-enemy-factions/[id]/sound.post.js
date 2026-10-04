// server/api/admin/cmoon-enemy-factions/[id]/sound.post.js
// Uploads one of a faction's six DEFAULT battle sounds — same six moments as a member's own
// sound.post.js (appear / damage-taken / damage-avoided / attacking / victory / defeat), stored on
// CMoonEnemyFaction's default*SoundPath columns instead. A member whose own slot is null falls
// back to its faction's matching default at serialization time (see resolveMemberSoundPaths in
// server/utils/cmoonEnemy.js) — a member with its own sound uploaded always wins over this.
//
// `slot` is checked against FACTION_DEFAULT_SOUND_SLOTS before it ever reaches Prisma's `data`
// object, same discipline as cmoon-enemy-members/[id]/sound.post.js's own `slot` check — never
// interpolate a client-sent field name straight into an update payload.
import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { assertInside } from '@/server/utils/imageUploadValidation'
import { sniffAudioType, audioExtFor, MAX_AUDIO_BYTES } from '@/server/utils/audioUploadValidation'
import { FACTION_DEFAULT_SOUND_SLOTS } from '@/server/utils/cmoonEnemy'
import { uploadDir, uploadFsPath, uploadPublicPath } from '@/server/utils/uploadStorage'

const FEATURE = 'cmoon-enemy-factions'
const SLOTS = new Set(FACTION_DEFAULT_SOUND_SLOTS)

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const faction = await db.cMoonEnemyFaction.findUnique({ where: { id } })
  if (!faction) throw createError({ statusCode: 404, statusMessage: 'Enemy faction not found' })

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
  const filename = `cmoon-enemy-faction-sound-${slot}-${id}-${Date.now()}${audioExtFor(sniffed)}`
  const outPath = assertInside(dir, uploadFsPath(FEATURE, filename))
  await writeFile(outPath, filePart.data)
  const newPath = uploadPublicPath(FEATURE, filename)

  const oldPath = faction[slot]
  await db.cMoonEnemyFaction.update({ where: { id }, data: { [slot]: newPath } })

  if (oldPath) {
    const oldFilename = oldPath.split('/').pop()
    if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyFaction', key: `defaultSound:${slot}:${id}`, prevValue: oldPath, newValue: newPath })

  return { slot, soundPath: newPath }
})
