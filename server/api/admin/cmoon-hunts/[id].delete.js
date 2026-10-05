// server/api/admin/cmoon-hunts/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const hunt = await db.cMoonHunt.findUnique({ where: { id } })
  if (!hunt) throw createError({ statusCode: 404, statusMessage: 'Hunt not found' })

  await db.cMoonHunt.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'CMoonHunt', key: `delete:${id}`, prevValue: { title: hunt.title }, newValue: null })

  return { ok: true }
})
