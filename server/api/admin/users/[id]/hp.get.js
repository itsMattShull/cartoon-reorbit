// server/api/admin/users/[id]/hp.get.js — one user's current cMoon battle HP picture for the
// "Manage User HP" admin tool: natural HP (default + rank bonus, zero adjustment), the stored
// adjustment, and the resulting effective HP. See server/utils/cmoonHpAdjustmentOps.js.
import { defineEventHandler, createError } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { getUserHpDetail } from '@/server/utils/cmoonHpAdjustmentOps'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const detail = await getUserHpDetail(id)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  return detail
})
