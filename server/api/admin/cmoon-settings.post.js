// server/api/admin/cmoon-settings.post.js
// Dedicated toggle for the cMoon feature flag, kept separate from the general
// global-config endpoint so the whole feature can be ripped out later by
// deleting this file + the cMoon-specific tables, without touching anything else.
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { invalidateGlobalConfigCache } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const enabled = !!body?.cMoonEnabled

  const existing = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const wasEnabled = !!existing?.cMoonEnabled

  const data = { cMoonEnabled: enabled }
  // Rising edge only: starting the feature (re)sets the launch timestamp and the
  // 3-day window existing users get to pick before auto-assignment kicks in.
  // Flipping it off never touches these — data/timers are preserved so turning
  // it back on later doesn't reset anyone's clock unexpectedly.
  if (enabled && !wasEnabled) {
    const now = new Date()
    data.cMoonEnabledAt = now
    data.cMoonSelectionDeadlineAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  }

  const updated = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, ...data },
    update: data,
  })
  invalidateGlobalConfigCache()

  await logAdminChange(db, {
    userId: me.id,
    area: 'cMoon',
    key: 'cMoonEnabled',
    prevValue: { cMoonEnabled: wasEnabled },
    newValue: { cMoonEnabled: enabled, cMoonEnabledAt: updated.cMoonEnabledAt, cMoonSelectionDeadlineAt: updated.cMoonSelectionDeadlineAt },
  })

  return {
    cMoonEnabled: updated.cMoonEnabled,
    cMoonEnabledAt: updated.cMoonEnabledAt,
    cMoonSelectionDeadlineAt: updated.cMoonSelectionDeadlineAt,
  }
})
