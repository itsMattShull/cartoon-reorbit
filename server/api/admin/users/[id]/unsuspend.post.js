// server/api/admin/users/[id]/unsuspend.post.js
// Lifts a temporary suspension early. See suspend.post.js for the full feature's design notes.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  // 1) Params & body
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const reason = (body?.reason || '').trim()
  if (!reason || reason.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Reason must be at least 10 characters.' })
  }

  // 2) Load target user
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, suspendedUntil: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Cannot unsuspend another admin' })

  // 3) Update (idempotent — lifting an already-expired/non-existent suspension just no-ops)
  const prev = { suspendedUntil: target.suspendedUntil }
  await prisma.user.update({
    where: { id: target.id },
    data: { suspendedUntil: null, suspendedReason: null }
  })

  await prisma.userBanNote.create({
    data: { userId: target.id, adminId: me.id, action: 'UNSUSPEND', reason }
  })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'unsuspendUser',
    prevValue: prev,
    newValue: { suspendedUntil: null, reason }
  })

  return { ok: true }
})
