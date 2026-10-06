// server/api/admin/cmoon-riddles/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const riddle = await db.cMoonRiddle.findUnique({ where: { id } })
  if (!riddle) throw createError({ statusCode: 404, statusMessage: 'Riddle not found' })

  await db.cMoonRiddle.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'CMoonRiddle', key: `delete:${id}`, prevValue: { kind: riddle.kind, question: riddle.question }, newValue: null })

  return { ok: true }
})
