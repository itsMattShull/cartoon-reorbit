// server/api/admin/global-config/ui-sounds.get.js
// Lists the uploaded "haptic sound" library for the admin Sounds tab's assignment dropdowns.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const sounds = await db.uiSound.findMany({ orderBy: { createdAt: 'desc' } })
  return sounds.map(s => ({ id: s.id, label: s.label, path: s.path, createdAt: s.createdAt }))
})
