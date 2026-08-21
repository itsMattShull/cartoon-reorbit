// server/api/admin/cmoons/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  if (cmoon.memberCount > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Cannot delete a cMoon that still has members — reassign them first' })
  }
  // Display-assigned cToons (Ctoon.cMoonId) are NOT a delete-blocker like
  // members are — that relation is `onDelete: SetNull`, so deleting a cMoon
  // here just reverts those cToons' modals to the default (unthemed) look,
  // which is a low-stakes, reversible outcome unlike losing faction members.

  await db.cMoon.delete({ where: { id } })
  await logAdminChange(db, { userId: me.id, area: 'cMoon', key: `delete:${id}`, prevValue: { name: cmoon.name }, newValue: null })

  return { ok: true }
})
