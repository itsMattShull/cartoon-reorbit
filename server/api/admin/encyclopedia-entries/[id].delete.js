// server/api/admin/encyclopedia-entries/[id].delete.js
// No FK anywhere references an EncyclopediaEntry — cross-entry links are plain hrefs embedded in
// another entry's sanitized body HTML, not a real relation (see this model's own schema comment),
// so there is no usage guard here. Deleting an entry that other entries link to leaves a normal,
// accepted dead link (the entry detail page shows a friendly "not found" for an unresolved slug),
// same as any wiki.
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { uploadFsPath } from '@/server/utils/uploadStorage'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const entry = await db.encyclopediaEntry.findUnique({ where: { id } })
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Encyclopedia entry not found' })

  await db.encyclopediaEntry.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'EncyclopediaEntry', key: `delete:${id}`, prevValue: { title: entry.title, slug: entry.slug }, newValue: null })

  if (entry.heroImagePath) {
    const filename = entry.heroImagePath.split('/').pop()
    if (filename) { try { await unlink(uploadFsPath('encyclopedia', filename)) } catch {} }
  }

  return { ok: true }
})
