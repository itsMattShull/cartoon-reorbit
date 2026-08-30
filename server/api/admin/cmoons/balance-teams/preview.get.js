// server/api/admin/cmoons/balance-teams/preview.get.js
import { defineEventHandler } from 'h3'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { computeBalancePlan } from '@/server/utils/cmoon'

// Pure read — safe to call as often as the admin UI wants (e.g. re-opening the modal).
// The plan is always recomputed fresh at execute time too, so this preview is only ever
// a display aid, never trusted input for the mutation itself.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const plan = await computeBalancePlan()
  return { ok: true, ...plan }
})
