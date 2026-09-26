// server/api/admin/encyclopedia-entries.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseEntryBody } from '@/server/utils/encyclopedia'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseEntryBody(body, undefined)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  let created
  try {
    created = await db.encyclopediaEntry.create({ data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'An entry with that slug already exists' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'EncyclopediaEntry', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, title: created.title, slug: created.slug } })

  return { id: created.id, slug: created.slug }
})
