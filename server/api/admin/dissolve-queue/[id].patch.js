// server/api/admin/dissolve-queue/[id].patch.js
// Reschedule a single dissolve-queue entry to a new date/time, or unpin one
// so it falls back under the automatic bulk scheduler.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { scheduleDissolveAuctionLaunch } from '@/server/utils/queues'
import { logAdminChange } from '@/server/utils/adminChangeLog'

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

  // Only these two shapes are ever read from the body — never spread it
  // directly into a Prisma `data` object, since this row also carries
  // fields (priority, fromInactive, category, …) a client must not set.
  const body = await readBody(event) || {}
  const { scheduledForUtc, unpin } = body

  const entry = await prisma.dissolveAuctionQueue.findUnique({ where: { id } })
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Queue entry not found' })

  if (unpin === true) {
    if (!entry.pinnedAt) return { ok: true, scheduledFor: entry.scheduledFor, pinnedAt: null }

    await prisma.dissolveAuctionQueue.update({ where: { id }, data: { pinnedAt: null } })

    await logAdminChange(prisma, {
      userId: me.id,
      area: 'Admin:DissolveQueue',
      key: 'unpinEntry',
      targetUsername: entry.sourceUsername,
      prevValue: { scheduledFor: entry.scheduledFor, pinnedAt: entry.pinnedAt },
      newValue:  { scheduledFor: entry.scheduledFor, pinnedAt: null }
    })

    return { ok: true, scheduledFor: entry.scheduledFor, pinnedAt: null }
  }

  if (!scheduledForUtc) throw createError({ statusCode: 400, statusMessage: 'scheduledForUtc required' })
  const scheduledFor = new Date(scheduledForUtc)
  if (isNaN(scheduledFor.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid scheduledForUtc' })

  const pinnedAt = new Date()
  await prisma.dissolveAuctionQueue.update({ where: { id }, data: { scheduledFor, pinnedAt } })
  await scheduleDissolveAuctionLaunch(id, scheduledFor)

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:DissolveQueue',
    key: 'rescheduleEntry',
    targetUsername: entry.sourceUsername,
    prevValue: { scheduledFor: entry.scheduledFor, pinnedAt: entry.pinnedAt },
    newValue:  { scheduledFor, pinnedAt }
  })

  return { ok: true, scheduledFor, pinnedAt }
})
