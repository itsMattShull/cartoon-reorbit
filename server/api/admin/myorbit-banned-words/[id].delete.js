import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const word = await db.myOrbitBannedWord.findUnique({ where: { id } })
  if (!word) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await db.myOrbitBannedWord.delete({ where: { id } })

  await logAdminChange(db, {
    userId: me.id, area: 'MyOrbitBannedWord', key: `delete:${id}`,
    prevValue: { phrase: word.phrase }, newValue: null
  })

  return { ok: true }
})
