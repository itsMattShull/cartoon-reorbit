// server/api/admin/users/[id]/dissolve-status.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { dissolveQueue } from '@/server/utils/queues'

export default defineEventHandler(async (event) => {
  // Auth: must be admin
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const job = await dissolveQueue.getJob(id)
  if (!job) {
    return { status: 'not_found', pct: 0, step: '' }
  }

  const state = await job.getState()
  const raw = job.progress
  const pct = typeof raw === 'object' && raw !== null ? (raw.pct ?? 0) : (typeof raw === 'number' ? raw : 0)
  const step = typeof raw === 'object' && raw !== null ? (raw.step ?? '') : ''

  if (state === 'completed') {
    return { status: 'completed', pct: 100, step: 'Done', summary: job.returnvalue }
  }
  if (state === 'failed') {
    return { status: 'failed', pct, step, error: job.failedReason || 'Unknown error' }
  }

  return { status: state, pct, step }
})
