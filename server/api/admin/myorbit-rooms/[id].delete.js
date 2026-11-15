// Cascades the room's own tiles/furniture placements (onDelete: Cascade); its moderation log
// rows survive with roomId set to null (onDelete: SetNull) - see MyOrbitRoom's own schema
// comment. NOTE for a later phase: once live presence exists (server/utils/myOrbitSocket.js),
// deleting a room with players currently in it needs to also kick them from the live socket
// room - this DB delete alone has no way to know about that in-memory state.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const room = await db.myOrbitRoom.findUnique({ where: { id } })
  if (!room) throw createError({ statusCode: 404, statusMessage: 'Room not found' })

  await db.myOrbitRoom.delete({ where: { id } })

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitRoom', key: `delete:${id}`,
    prevValue: { name: room.name }, newValue: null
  })

  return { ok: true }
})
