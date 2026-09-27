// server/api/admin/encyclopedia-entries/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseEntryBody } from '@/server/utils/encyclopedia'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const entry = await db.encyclopediaEntry.findUnique({ where: { id } })
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Encyclopedia entry not found' })

  const body = await readBody(event)
  const parsed = parseEntryBody(body, entry)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  try {
    await db.encyclopediaEntry.update({ where: { id }, data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'An entry with that slug already exists' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'EncyclopediaEntry',
    key: `update:${id}`,
    prevValue: { title: entry.title, slug: entry.slug, active: entry.active, sortOrder: entry.sortOrder },
    newValue: { title: parsed.data.title, slug: parsed.data.slug, active: parsed.data.active, sortOrder: parsed.data.sortOrder },
  })

  return { ok: true, slug: parsed.data.slug }
})
