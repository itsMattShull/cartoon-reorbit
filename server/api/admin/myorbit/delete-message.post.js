// Retracts a live chat message from everyone currently seeing it, and audits the act. The
// message text/sender are supplied by the admin UI itself (AdminMyOrbitModeration.vue), captured
// from the live broadcast it already received while spectating — nothing server-side persists
// chat messages anywhere to look them up by id (see MyOrbitModerationLog's own schema comment),
// so this is the only place the deleted text survives at all.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parseMyOrbitDeleteMessageBody } from '@/server/utils/myOrbitModeration'
import { emitToSocketServer } from '@/server/utils/socketBridge'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseMyOrbitDeleteMessageBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  try {
    await db.myOrbitModerationLog.create({
      data: {
        roomId: parsed.data.roomId, targetUserId: parsed.data.targetUserId, adminUserId: me.id,
        action: 'DELETE_MESSAGE', reason: parsed.data.reason, messageSnapshot: parsed.data.messageText || null
      }
    })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 404, statusMessage: 'That room or user no longer exists' })
    }
    throw err
  }

  await emitToSocketServer('myorbit:adminDeleteMessage', { roomId: parsed.data.roomId, messageId: parsed.data.messageId })

  return { ok: true }
})
