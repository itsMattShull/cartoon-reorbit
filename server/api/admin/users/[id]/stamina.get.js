// server/api/admin/users/[id]/stamina.get.js — one user's current cMoon battle stamina picture
// for the "Manage User HP" admin tool's Stamina section: natural stamina (site-wide default,
// zero adjustment), the stored adjustment, and the resulting effective stamina. See
// server/utils/cmoonStaminaAdjustmentOps.js.
import { defineEventHandler, createError } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { getUserStaminaDetail } from '@/server/utils/cmoonStaminaAdjustmentOps'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const detail = await getUserStaminaDetail(id)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  return detail
})
