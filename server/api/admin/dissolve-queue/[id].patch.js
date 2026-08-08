// server/api/admin/dissolve-queue/[id].patch.js
// Reschedule a single dissolve-queue entry to a new date/time.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { scheduleDissolveAuctionLaunch } from '@/server/utils/queues'

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

  const body = await readBody(event) || {}
  const { scheduledForUtc } = body
  if (!scheduledForUtc) throw createError({ statusCode: 400, statusMessage: 'scheduledForUtc required' })
  const scheduledFor = new Date(scheduledForUtc)
  if (isNaN(scheduledFor.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid scheduledForUtc' })

  const entry = await prisma.dissolveAuctionQueue.findUnique({ where: { id } })
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Queue entry not found' })

  await prisma.dissolveAuctionQueue.update({ where: { id }, data: { scheduledFor } })
  await scheduleDissolveAuctionLaunch(id, scheduledFor)

  return { ok: true, scheduledFor }
})
