// server/api/admin/cmoon-pvp-settings.post.js
// Dedicated toggle/config endpoint for cMoon PvP, kept separate from cmoon-settings.post.js — same
// "keep each feature area independently rip-out-able" rationale that file's own header comment
// gives for its own separation from the general global-config endpoint.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { invalidateGlobalConfigCache } from '@/server/utils/cmoon'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { RAID_ROUND_LIMIT_MIN, RAID_ROUND_LIMIT_MAX } from '@/server/utils/cmoonEnemy'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const existing = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })

  const data = {}

  // Master on/off switch — checked before the chance roll... there is no roll for PvP (it's
  // player-initiated, not offered like the solo/raid popup), but this still gates the whole
  // cmoonpvp:start handler in server/utils/cmoonPvpSocket.js the same way
  // cMoonEnemyBattlesEnabled gates raid/solo.
  if (body?.cMoonPvpEnabled !== undefined) {
    data.cMoonPvpEnabled = !!body.cMoonPvpEnabled
  }

  // Up to 8-a-side, per the feature request — see GlobalGameConfig.cMoonPvpMaxTeamSize's own
  // schema comment. Snapshotted onto each match at creation (cmoonpvp:start), never retroactive.
  if (body?.cMoonPvpMaxTeamSize !== undefined) {
    const size = Number(body.cMoonPvpMaxTeamSize)
    if (!Number.isInteger(size) || size < 1 || size > 8) {
      throw createError({ statusCode: 400, statusMessage: 'Max team size must be a whole number between 1 and 8' })
    }
    data.cMoonPvpMaxTeamSize = size
  }

  // Restricts each match's two sides to one cMoon's own members apiece — see
  // loadPvpEligibility in server/utils/cmoonPvpSocket.js, the only enforcer.
  if (body?.cMoonPvpTeammatesOnlyEnabled !== undefined) {
    data.cMoonPvpTeammatesOnlyEnabled = !!body.cMoonPvpTeammatesOnlyEnabled
  }

  // Flattens every PvP participant's max HP to one admin-set amount, regardless of cMoon rank —
  // see getPvpCombatMaxHp in server/utils/cmoon.js. Bounded like cMoonEnemyBattleDefaultHp
  // (1-50): this is a per-player HP value, not a boss HP value, so it doesn't belong in the far
  // wider MAX_HP_MIN/MAX_HP_MAX boss range.
  if (body?.cMoonPvpEqualizeHpEnabled !== undefined) {
    data.cMoonPvpEqualizeHpEnabled = !!body.cMoonPvpEqualizeHpEnabled
  }
  if (body?.cMoonPvpEqualizeHpAmount !== undefined) {
    const hp = Number(body.cMoonPvpEqualizeHpAmount)
    if (!Number.isInteger(hp) || hp < 1 || hp > 50) {
      throw createError({ statusCode: 400, statusMessage: 'Equalized HP must be a whole number between 1 and 50' })
    }
    data.cMoonPvpEqualizeHpAmount = hp
  }

  // cMoon points split across the winning team on a match win — see splitPvpPoints's own caller
  // in resolveCMoonPvpOutcome (server/utils/cmoonPvpSocket.js). 0 disables it.
  if (body?.cMoonPvpPointsPerWin !== undefined) {
    const pts = Number(body.cMoonPvpPointsPerWin)
    if (!Number.isInteger(pts) || pts < 0 || pts > 10000) {
      throw createError({ statusCode: 400, statusMessage: 'Points per win must be a whole number between 0 and 10000' })
    }
    data.cMoonPvpPointsPerWin = pts
  }

  // How long a FORMING match's join window stays open by default — same 15-120s bound
  // cMoonRaidJoinWindowSeconds already uses; a leader's own keep-open/speed-vote controls operate
  // independently on top of this (see cmoonPvpSocket.js).
  if (body?.cMoonPvpJoinWindowSeconds !== undefined) {
    const seconds = Number(body.cMoonPvpJoinWindowSeconds)
    if (!Number.isInteger(seconds) || seconds < 15 || seconds > 120) {
      throw createError({ statusCode: 400, statusMessage: 'Join window must be a whole number of seconds between 15 and 120' })
    }
    data.cMoonPvpJoinWindowSeconds = seconds
  }

  // Round-count safety valve — reuses the raid boss's own round-limit bounds
  // (RAID_ROUND_LIMIT_MIN/MAX in server/utils/cmoonEnemy.js), the closest existing precedent for
  // "how many rounds is too many for a live two-sided fight to run."
  if (body?.cMoonPvpRoundLimit !== undefined) {
    const limit = Number(body.cMoonPvpRoundLimit)
    if (!Number.isInteger(limit) || limit < RAID_ROUND_LIMIT_MIN || limit > RAID_ROUND_LIMIT_MAX) {
      throw createError({ statusCode: 400, statusMessage: `Round limit must be a whole number between ${RAID_ROUND_LIMIT_MIN} and ${RAID_ROUND_LIMIT_MAX}` })
    }
    data.cMoonPvpRoundLimit = limit
  }

  // Invite-only matches, discoverability-only (not real access control) — same semantics as
  // cMoonRaidPrivateLobbiesEnabled, see that field's own schema comment.
  if (body?.cMoonPvpPrivateLobbiesEnabled !== undefined) {
    data.cMoonPvpPrivateLobbiesEnabled = !!body.cMoonPvpPrivateLobbiesEnabled
  }

  const updated = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, ...data },
    update: data,
  })
  invalidateGlobalConfigCache()

  await logAdminChange(db, {
    userId: me.id,
    area: 'cMoonPvp',
    key: 'cMoonPvpEnabled',
    prevValue: {
      cMoonPvpEnabled: existing?.cMoonPvpEnabled,
      cMoonPvpMaxTeamSize: existing?.cMoonPvpMaxTeamSize,
      cMoonPvpTeammatesOnlyEnabled: existing?.cMoonPvpTeammatesOnlyEnabled,
      cMoonPvpEqualizeHpEnabled: existing?.cMoonPvpEqualizeHpEnabled,
      cMoonPvpEqualizeHpAmount: existing?.cMoonPvpEqualizeHpAmount,
      cMoonPvpPointsPerWin: existing?.cMoonPvpPointsPerWin,
      cMoonPvpJoinWindowSeconds: existing?.cMoonPvpJoinWindowSeconds,
      cMoonPvpRoundLimit: existing?.cMoonPvpRoundLimit,
      cMoonPvpPrivateLobbiesEnabled: existing?.cMoonPvpPrivateLobbiesEnabled,
    },
    newValue: {
      cMoonPvpEnabled: updated.cMoonPvpEnabled,
      cMoonPvpMaxTeamSize: updated.cMoonPvpMaxTeamSize,
      cMoonPvpTeammatesOnlyEnabled: updated.cMoonPvpTeammatesOnlyEnabled,
      cMoonPvpEqualizeHpEnabled: updated.cMoonPvpEqualizeHpEnabled,
      cMoonPvpEqualizeHpAmount: updated.cMoonPvpEqualizeHpAmount,
      cMoonPvpPointsPerWin: updated.cMoonPvpPointsPerWin,
      cMoonPvpJoinWindowSeconds: updated.cMoonPvpJoinWindowSeconds,
      cMoonPvpRoundLimit: updated.cMoonPvpRoundLimit,
      cMoonPvpPrivateLobbiesEnabled: updated.cMoonPvpPrivateLobbiesEnabled,
    },
  })

  return {
    cMoonPvpEnabled: updated.cMoonPvpEnabled,
    cMoonPvpMaxTeamSize: updated.cMoonPvpMaxTeamSize,
    cMoonPvpTeammatesOnlyEnabled: updated.cMoonPvpTeammatesOnlyEnabled,
    cMoonPvpEqualizeHpEnabled: updated.cMoonPvpEqualizeHpEnabled,
    cMoonPvpEqualizeHpAmount: updated.cMoonPvpEqualizeHpAmount,
    cMoonPvpPointsPerWin: updated.cMoonPvpPointsPerWin,
    cMoonPvpJoinWindowSeconds: updated.cMoonPvpJoinWindowSeconds,
    cMoonPvpRoundLimit: updated.cMoonPvpRoundLimit,
    cMoonPvpPrivateLobbiesEnabled: updated.cMoonPvpPrivateLobbiesEnabled,
  }
})
