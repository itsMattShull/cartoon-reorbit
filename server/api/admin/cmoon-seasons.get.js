// server/api/admin/cmoon-seasons.get.js
// Lists every cMoon season (past, current, future) for the admin "Manage Navigation" page.
import { defineEventHandler } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { listAllSeasons } from '@/server/utils/cmoonSeasons'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const items = await listAllSeasons()
  return { items }
})
