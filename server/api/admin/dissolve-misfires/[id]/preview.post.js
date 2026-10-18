// server/api/admin/dissolve-misfires/[id]/preview.post.js
// Read-only: returns the remediation plan for one misfire (see
// server/utils/dissolveMisfireRemediation.js) so the admin UI can show exactly what a resolve
// would do before it's confirmed. Computing it here rather than trusting a client-held copy
// means the "Confirm" button on an already-stale preview still gets a fresh re-check inside
// the worker/transaction before anything is actually executed.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { computeRemediationPlan } from '@/server/utils/dissolveMisfireRemediation'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const plan = await computeRemediationPlan(id)
  return plan
})
