// server/api/admin/encyclopedia-entries.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const entries = await db.encyclopediaEntry.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  })

  return {
    entries: entries.map(e => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      heroImagePath: e.heroImagePath,
      body: e.body,
      active: e.active,
      sortOrder: e.sortOrder,
      updatedAt: e.updatedAt,
    })),
  }
})
