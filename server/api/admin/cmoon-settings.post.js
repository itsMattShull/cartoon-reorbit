// server/api/admin/cmoon-settings.post.js
// Dedicated toggle for the cMoon feature flag, kept separate from the general
// global-config endpoint so the whole feature can be ripped out later by
// deleting this file + the cMoon-specific tables, without touching anything else.
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { invalidateGlobalConfigCache } from '@/server/utils/cmoon'
import { assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  // Pre-existing gap: this endpoint had no CSRF check before it also grew the two
  // cMoonBattlePopup* fields below — added while touching this file for that, matching every
  // other admin mutation endpoint's convention (see server/utils/requireAdmin.js).
  assertSameOrigin(event)
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const enabled = !!body?.cMoonEnabled

  const existing = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const wasEnabled = !!existing?.cMoonEnabled

  const data = { cMoonEnabled: enabled }
  // Rising edge only: starting the feature (re)sets the launch timestamp, purely informational
  // (shown in the admin panel as "Launched X"). Flipping it off never touches this — turning it
  // back on later doesn't reset it unexpectedly. There is no selection deadline to set: players
  // pick a cMoon or explicitly opt out, with no auto-assignment either way.
  if (enabled && !wasEnabled) {
    data.cMoonEnabledAt = new Date()
  }

  // Optional: how long an opted-out player must wait before rejoining (see
  // computeCMoonRejoinAvailableAt in server/utils/cmoon.js). Omitted from the body when this
  // request is only toggling the feature flag itself — preserves the existing value in that case.
  if (body?.cMoonOptOutCooldownDays !== undefined) {
    const days = Number(body.cMoonOptOutCooldownDays)
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      throw createError({ statusCode: 400, statusMessage: 'Cooldown must be a whole number of days between 0 and 365' })
    }
    data.cMoonOptOutCooldownDays = days
  }

  // How often the cMoon Enemy Battles popup rolls on page navigation, and how long a player must
  // wait after being offered one (whether they fought or declined) before being offered again —
  // see server/api/cmoon/battle/consider.post.js, the only reader of either field.
  if (body?.cMoonBattlePopupChancePercent !== undefined) {
    const pct = Number(body.cMoonBattlePopupChancePercent)
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      throw createError({ statusCode: 400, statusMessage: 'Battle popup chance must be a whole number between 0 and 100' })
    }
    data.cMoonBattlePopupChancePercent = pct
  }
  if (body?.cMoonBattlePopupCooldownMinutes !== undefined) {
    const minutes = Number(body.cMoonBattlePopupCooldownMinutes)
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      throw createError({ statusCode: 400, statusMessage: 'Battle popup cooldown must be a whole number of minutes between 0 and 1440' })
    }
    data.cMoonBattlePopupCooldownMinutes = minutes
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
    prevValue: {
      cMoonEnabled: wasEnabled,
      cMoonOptOutCooldownDays: existing?.cMoonOptOutCooldownDays,
      cMoonBattlePopupChancePercent: existing?.cMoonBattlePopupChancePercent,
      cMoonBattlePopupCooldownMinutes: existing?.cMoonBattlePopupCooldownMinutes,
    },
    newValue: {
      cMoonEnabled: enabled,
      cMoonEnabledAt: updated.cMoonEnabledAt,
      cMoonOptOutCooldownDays: updated.cMoonOptOutCooldownDays,
      cMoonBattlePopupChancePercent: updated.cMoonBattlePopupChancePercent,
      cMoonBattlePopupCooldownMinutes: updated.cMoonBattlePopupCooldownMinutes,
    },
  })

  return {
    cMoonEnabled: updated.cMoonEnabled,
    cMoonEnabledAt: updated.cMoonEnabledAt,
    cMoonOptOutCooldownDays: updated.cMoonOptOutCooldownDays,
    cMoonBattlePopupChancePercent: updated.cMoonBattlePopupChancePercent,
    cMoonBattlePopupCooldownMinutes: updated.cMoonBattlePopupCooldownMinutes,
  }
})
