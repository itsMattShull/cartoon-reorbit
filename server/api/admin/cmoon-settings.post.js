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

  const existing = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const wasEnabled = !!existing?.cMoonEnabled

  const data = {}
  // Gated like every other field below (not always-on): this endpoint now has THREE separate
  // save buttons in AdminCMoon.vue (the flag itself, the enemy-battles flag, the popup settings),
  // and each one previously had to echo back its own client-cached copy of cMoonEnabled just to
  // avoid clobbering it on every save — a stale copy in one browser tab (e.g. after another admin
  // flips it elsewhere) would then silently un-toggle it as a side effect of an unrelated save.
  // Omitted entirely, it now just preserves whatever's already in the DB.
  let enabled = wasEnabled
  if (body?.cMoonEnabled !== undefined) {
    enabled = !!body.cMoonEnabled
    data.cMoonEnabled = enabled
    // Rising edge only: starting the feature (re)sets the launch timestamp, purely informational
    // (shown in the admin panel as "Launched X"). Flipping it off never touches this — turning it
    // back on later doesn't reset it unexpectedly. There is no selection deadline to set: players
    // pick a cMoon or explicitly opt out, with no auto-assignment either way.
    if (enabled && !wasEnabled) {
      data.cMoonEnabledAt = new Date()
    }
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

  // Master on/off switch for the whole cMoon Enemy Battles feature — see
  // GlobalGameConfig.cMoonEnemyBattlesEnabled's schema comment. Checked before anything else in
  // server/api/cmoon/battle/consider.post.js and start.post.js, independent of the appearance-rate
  // knobs below (those only matter once this is on).
  if (body?.cMoonEnemyBattlesEnabled !== undefined) {
    data.cMoonEnemyBattlesEnabled = !!body.cMoonEnemyBattlesEnabled
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

  // Caps how many NON-raid-boss enemies a single player can be offered within a rolling window —
  // see GlobalGameConfig.cMoonEnemySpawnCapCount's own schema comment. 0 disables the cap (same
  // "0 disables" convention as the popup chance % above); the window field is only meaningful once
  // the cap itself is > 0, but still validated independently so an admin can pre-set it either way.
  if (body?.cMoonEnemySpawnCapCount !== undefined) {
    const cap = Number(body.cMoonEnemySpawnCapCount)
    if (!Number.isInteger(cap) || cap < 0 || cap > 1000) {
      throw createError({ statusCode: 400, statusMessage: 'Spawn cap must be a whole number between 0 and 1000' })
    }
    data.cMoonEnemySpawnCapCount = cap
  }
  if (body?.cMoonEnemySpawnCapWindowHours !== undefined) {
    const hours = Number(body.cMoonEnemySpawnCapWindowHours)
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      throw createError({ statusCode: 400, statusMessage: 'Spawn cap window must be a whole number of hours between 1 and 720' })
    }
    data.cMoonEnemySpawnCapWindowHours = hours
  }

  // Discord channel a raid boss announcement posts to — see announceCMoonRaidBoss in
  // server/utils/discord.js. Same admin-configurable-with-env-fallback shape as
  // achievementDiscordChannelId; empty string clears it back to null (falls back to
  // DISCORD_ANNOUNCEMENTS_CHANNEL).
  if (body?.cMoonRaidBossDiscordChannelId !== undefined) {
    const raw = typeof body.cMoonRaidBossDiscordChannelId === 'string' ? body.cMoonRaidBossDiscordChannelId.trim() : ''
    data.cMoonRaidBossDiscordChannelId = raw || null
  }

  // Every player's starting/max HP for a cMoon Enemy Battle (solo or raid) — see
  // getPlayerCombatMaxHp() in server/utils/cmoon.js, the only reader. Bounded the same way
  // CMoonEnemyMember's own maxHp is (server/utils/cmoonEnemy.js's MAX_HP_MIN/MAX_HP_MAX): each
  // round deals at most one hit, so a value far above this range would make every PER_PLAYER
  // enemy effectively unwinnable on the admin's side of the fight, not just the player's.
  if (body?.cMoonEnemyBattleDefaultHp !== undefined) {
    const hp = Number(body.cMoonEnemyBattleDefaultHp)
    if (!Number.isInteger(hp) || hp < 1 || hp > 50) {
      throw createError({ statusCode: 400, statusMessage: 'Default HP must be a whole number between 1 and 50' })
    }
    data.cMoonEnemyBattleDefaultHp = hp
  }

  // "Higher tiered enemies first" — see GlobalGameConfig.cMoonEnemyHigherTierFirst's own schema
  // comment. Read by consider.post.js's candidate roll, nowhere else.
  if (body?.cMoonEnemyHigherTierFirst !== undefined) {
    data.cMoonEnemyHigherTierFirst = !!body.cMoonEnemyHigherTierFirst
  }

  // cMoon points awarded for solving a riddle (either kind) — see claimCMoonRiddleSolve in
  // server/utils/cmoonRiddle.js, the only reader.
  if (body?.cMoonRiddlePoints !== undefined) {
    const pts = Number(body.cMoonRiddlePoints)
    if (!Number.isInteger(pts) || pts < 0 || pts > 10000) {
      throw createError({ statusCode: 400, statusMessage: 'Riddle points must be a whole number between 0 and 10000' })
    }
    data.cMoonRiddlePoints = pts
  }

  // Weekly riddle auto-posting schedule — see server/cron/cmoon-riddle-rotation.js, the only
  // reader of all four fields together.
  if (body?.cMoonRiddleRotationEnabled !== undefined) {
    data.cMoonRiddleRotationEnabled = !!body.cMoonRiddleRotationEnabled
  }
  if (body?.cMoonRiddleRotationDayOfWeek !== undefined) {
    const dow = Number(body.cMoonRiddleRotationDayOfWeek)
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      throw createError({ statusCode: 400, statusMessage: 'Rotation day of week must be 0 (Sunday) through 6 (Saturday)' })
    }
    data.cMoonRiddleRotationDayOfWeek = dow
  }
  if (body?.cMoonRiddleRotationHour !== undefined) {
    const hour = Number(body.cMoonRiddleRotationHour)
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw createError({ statusCode: 400, statusMessage: 'Rotation hour must be a whole number between 0 and 23' })
    }
    data.cMoonRiddleRotationHour = hour
  }
  if (body?.cMoonRiddleRotationMinute !== undefined) {
    const minute = Number(body.cMoonRiddleRotationMinute)
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw createError({ statusCode: 400, statusMessage: 'Rotation minute must be a whole number between 0 and 59' })
    }
    data.cMoonRiddleRotationMinute = minute
  }

  // cMoon points awarded to EACH cMoon that completes a split-clue scavenger hunt — see
  // claimCMoonHuntCompletion in server/utils/cmoonHunt.js, the only reader.
  if (body?.cMoonHuntPoints !== undefined) {
    const pts = Number(body.cMoonHuntPoints)
    if (!Number.isInteger(pts) || pts < 0 || pts > 10000) {
      throw createError({ statusCode: 400, statusMessage: 'Hunt points must be a whole number between 0 and 10000' })
    }
    data.cMoonHuntPoints = pts
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
      cMoonEnemyBattlesEnabled: existing?.cMoonEnemyBattlesEnabled,
      cMoonBattlePopupChancePercent: existing?.cMoonBattlePopupChancePercent,
      cMoonBattlePopupCooldownMinutes: existing?.cMoonBattlePopupCooldownMinutes,
      cMoonEnemySpawnCapCount: existing?.cMoonEnemySpawnCapCount,
      cMoonEnemySpawnCapWindowHours: existing?.cMoonEnemySpawnCapWindowHours,
      cMoonRaidBossDiscordChannelId: existing?.cMoonRaidBossDiscordChannelId,
      cMoonEnemyBattleDefaultHp: existing?.cMoonEnemyBattleDefaultHp,
      cMoonEnemyHigherTierFirst: existing?.cMoonEnemyHigherTierFirst,
      cMoonRiddlePoints: existing?.cMoonRiddlePoints,
      cMoonRiddleRotationEnabled: existing?.cMoonRiddleRotationEnabled,
      cMoonRiddleRotationDayOfWeek: existing?.cMoonRiddleRotationDayOfWeek,
      cMoonRiddleRotationHour: existing?.cMoonRiddleRotationHour,
      cMoonRiddleRotationMinute: existing?.cMoonRiddleRotationMinute,
      cMoonHuntPoints: existing?.cMoonHuntPoints,
    },
    newValue: {
      cMoonEnabled: enabled,
      cMoonEnabledAt: updated.cMoonEnabledAt,
      cMoonOptOutCooldownDays: updated.cMoonOptOutCooldownDays,
      cMoonEnemyBattlesEnabled: updated.cMoonEnemyBattlesEnabled,
      cMoonBattlePopupChancePercent: updated.cMoonBattlePopupChancePercent,
      cMoonBattlePopupCooldownMinutes: updated.cMoonBattlePopupCooldownMinutes,
      cMoonEnemySpawnCapCount: updated.cMoonEnemySpawnCapCount,
      cMoonEnemySpawnCapWindowHours: updated.cMoonEnemySpawnCapWindowHours,
      cMoonRaidBossDiscordChannelId: updated.cMoonRaidBossDiscordChannelId,
      cMoonEnemyBattleDefaultHp: updated.cMoonEnemyBattleDefaultHp,
      cMoonEnemyHigherTierFirst: updated.cMoonEnemyHigherTierFirst,
      cMoonRiddlePoints: updated.cMoonRiddlePoints,
      cMoonRiddleRotationEnabled: updated.cMoonRiddleRotationEnabled,
      cMoonRiddleRotationDayOfWeek: updated.cMoonRiddleRotationDayOfWeek,
      cMoonRiddleRotationHour: updated.cMoonRiddleRotationHour,
      cMoonRiddleRotationMinute: updated.cMoonRiddleRotationMinute,
      cMoonHuntPoints: updated.cMoonHuntPoints,
    },
  })

  return {
    cMoonEnabled: updated.cMoonEnabled,
    cMoonEnabledAt: updated.cMoonEnabledAt,
    cMoonOptOutCooldownDays: updated.cMoonOptOutCooldownDays,
    cMoonEnemyBattlesEnabled: updated.cMoonEnemyBattlesEnabled,
    cMoonBattlePopupChancePercent: updated.cMoonBattlePopupChancePercent,
    cMoonBattlePopupCooldownMinutes: updated.cMoonBattlePopupCooldownMinutes,
    cMoonEnemySpawnCapCount: updated.cMoonEnemySpawnCapCount,
    cMoonEnemySpawnCapWindowHours: updated.cMoonEnemySpawnCapWindowHours,
    cMoonRaidBossDiscordChannelId: updated.cMoonRaidBossDiscordChannelId,
    cMoonEnemyBattleDefaultHp: updated.cMoonEnemyBattleDefaultHp,
    cMoonEnemyHigherTierFirst: updated.cMoonEnemyHigherTierFirst,
    cMoonRiddlePoints: updated.cMoonRiddlePoints,
    cMoonRiddleRotationEnabled: updated.cMoonRiddleRotationEnabled,
    cMoonRiddleRotationDayOfWeek: updated.cMoonRiddleRotationDayOfWeek,
    cMoonRiddleRotationHour: updated.cMoonRiddleRotationHour,
    cMoonRiddleRotationMinute: updated.cMoonRiddleRotationMinute,
    cMoonHuntPoints: updated.cMoonHuntPoints,
  }
})
