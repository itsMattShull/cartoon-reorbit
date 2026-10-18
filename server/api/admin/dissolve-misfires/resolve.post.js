// server/api/admin/dissolve-misfires/resolve.post.js
// Enqueues the "Resolve Dissolve Misfires" job (see
// server/workers/dissolve-misfire-resolve.worker.js) for one or many misfire ids — only
// enqueues, the actual per-misfire restore+compensate runs in the worker so a large batch
// doesn't block this request. A second click while a run is already in flight returns that
// run's jobId instead of starting a second overlapping one, same guard as backfill-points.post.js.
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { dissolveMisfireResolveQueue } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const misfireIds = Array.isArray(body?.misfireIds)
    ? [...new Set(body.misfireIds.map(String).filter(Boolean))]
    : []
  if (!misfireIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'misfireIds must be a non-empty array' })
  }

  const inFlight = await dissolveMisfireResolveQueue.getJobs(['active', 'waiting', 'delayed'])
  if (inFlight.length) {
    const existing = inFlight[0]
    return { jobId: existing.id, alreadyRunning: true, misfireIds: existing.data?.misfireIds || [] }
  }

  const job = await dissolveMisfireResolveQueue.add(
    'resolve',
    { misfireIds, adminId: me.id, adminUsername: me.username || me.id },
    { jobId: `dissolve-misfire-resolve-${Date.now()}` }
  )

  return { jobId: job.id, misfireIds }
})
