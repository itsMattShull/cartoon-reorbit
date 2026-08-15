// server/api/admin/dissolve-queue/schedule.post.js
// Reschedule all (or unscheduled) dissolve-queue entries from the management page.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { applyDissolveSchedule, saveDissolveScheduleConfig } from '@/server/utils/dissolveSchedule'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event) || {}
  const {
    startAtUtc,
    cadenceDays,
    featuredPerCadence,
    otherPerCadence,
    reschedule = false,
    includePinned = false,
  } = body

  if (!startAtUtc) throw createError({ statusCode: 400, statusMessage: 'startAtUtc required' })
  if (isNaN(new Date(startAtUtc).getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid startAtUtc' })
  if (!cadenceDays || Number(cadenceDays) < 1) throw createError({ statusCode: 400, statusMessage: 'cadenceDays must be >= 1' })

  // Persist as the default cadence so the automatic 9-month inactivity dissolve
  // cron can keep scheduling new entries the same way going forward.
  await saveDissolveScheduleConfig({ cadenceDays, featuredPerCadence, otherPerCadence })

  // Only relevant when reschedule is also true — an admin explicitly choosing
  // to reset entries other mods hand-scheduled is worth a distinct audit entry,
  // since it silently discards their manual holds.
  if (reschedule && includePinned) {
    const pinnedCount = await prisma.dissolveAuctionQueue.count({ where: { pinnedAt: { not: null } } })
    if (pinnedCount > 0) {
      await logAdminChange(prisma, {
        userId: me.id,
        area: 'Admin:DissolveQueue',
        key: 'bulkRescheduleOverridePinned',
        prevValue: { pinnedCount },
        newValue:  { startAtUtc, cadenceDays, featuredPerCadence, otherPerCadence }
      })
    }
  }

  const scheduled = await applyDissolveSchedule({ startAtUtc, cadenceDays, featuredPerCadence, otherPerCadence, reschedule, includePinned })

  return { scheduled }
})
