// Clears a room's ambience track (silence), deleting the file on disk so it doesn't linger as an
// orphan once nothing references it.
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { uploadFsPath } from '@/server/utils/uploadStorage'

const FEATURE = 'myorbit-rooms'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const room = await db.myOrbitRoom.findUnique({ where: { id } })
  if (!room) throw createError({ statusCode: 404, statusMessage: 'Room not found' })
  if (!room.ambientSoundPath) return { ok: true }

  await db.myOrbitRoom.update({ where: { id }, data: { ambientSoundPath: null } })

  const oldFilename = room.ambientSoundPath.split('/').pop()
  if (oldFilename) { try { await unlink(uploadFsPath(FEATURE, oldFilename)) } catch {} }

  await logAdminChange(db, { userId: me.id, area: 'MyOrbitRoom', key: `ambientSound:${id}`, prevValue: room.ambientSoundPath, newValue: null })

  return { ok: true }
})
