// server/api/admin/cmoon-season.post.js
// Updates the season header/blurb only — starting a new season (moving startedAt) is a separate,
// deliberately distinct action (see cmoon-season/start-new.post.js) since it changes what every
// tracker measures going forward, not just display text.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { sanitizeEncyclopediaHtml } from '@/server/utils/sanitizeEncyclopediaHtml'
import { getSeasonConfig, SEASON_CONFIG_ID } from '@/server/utils/cmoonSeason'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const HEADER_MAX_LENGTH = 80
const ENEMIES_GOAL_LABEL_MAX_LENGTH = 60
const ENEMIES_GOAL_TARGET_MIN = 1
const ENEMIES_GOAL_TARGET_MAX = 1_000_000

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const header = typeof body?.header === 'string' ? body.header.trim() : ''
  if (!header || header.length > HEADER_MAX_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Header is required (max ${HEADER_MAX_LENGTH} characters)` })
  }
  const blurb = typeof body?.blurb === 'string' ? sanitizeEncyclopediaHtml(body.blurb) : ''

  const enemiesDefeatedGoalEnabled = !!body?.enemiesDefeatedGoalEnabled
  const enemiesDefeatedGoalLabel = typeof body?.enemiesDefeatedGoalLabel === 'string'
    ? body.enemiesDefeatedGoalLabel.trim()
    : ''
  const enemiesDefeatedGoalTarget = Number(body?.enemiesDefeatedGoalTarget)

  // Only validated when the bar is actually (being) enabled — an admin turning the bar off
  // shouldn't be blocked by a stale/blank label or target left over from before.
  if (enemiesDefeatedGoalEnabled) {
    if (!enemiesDefeatedGoalLabel || enemiesDefeatedGoalLabel.length > ENEMIES_GOAL_LABEL_MAX_LENGTH) {
      throw createError({
        statusCode: 400,
        statusMessage: `Enemies-defeated goal label is required (max ${ENEMIES_GOAL_LABEL_MAX_LENGTH} characters)`,
      })
    }
    if (!Number.isInteger(enemiesDefeatedGoalTarget) || enemiesDefeatedGoalTarget < ENEMIES_GOAL_TARGET_MIN || enemiesDefeatedGoalTarget > ENEMIES_GOAL_TARGET_MAX) {
      throw createError({
        statusCode: 400,
        statusMessage: `Enemies-defeated goal target must be a whole number between ${ENEMIES_GOAL_TARGET_MIN} and ${ENEMIES_GOAL_TARGET_MAX}`,
      })
    }
  }

  const existing = await getSeasonConfig()
  const updated = await db.cMoonSeasonConfig.update({
    where: { id: SEASON_CONFIG_ID },
    data: {
      header,
      blurb,
      enemiesDefeatedGoalEnabled,
      enemiesDefeatedGoalLabel: enemiesDefeatedGoalLabel || existing.enemiesDefeatedGoalLabel,
      enemiesDefeatedGoalTarget: Number.isInteger(enemiesDefeatedGoalTarget) ? enemiesDefeatedGoalTarget : existing.enemiesDefeatedGoalTarget,
    },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonSeasonConfig',
    key: 'update',
    prevValue: {
      header: existing.header,
      enemiesDefeatedGoalEnabled: existing.enemiesDefeatedGoalEnabled,
      enemiesDefeatedGoalLabel: existing.enemiesDefeatedGoalLabel,
      enemiesDefeatedGoalTarget: existing.enemiesDefeatedGoalTarget,
    },
    newValue: {
      header: updated.header,
      enemiesDefeatedGoalEnabled: updated.enemiesDefeatedGoalEnabled,
      enemiesDefeatedGoalLabel: updated.enemiesDefeatedGoalLabel,
      enemiesDefeatedGoalTarget: updated.enemiesDefeatedGoalTarget,
    },
  })

  return {
    header: updated.header,
    blurb: updated.blurb,
    startedAt: updated.startedAt,
    enemiesDefeatedGoalEnabled: updated.enemiesDefeatedGoalEnabled,
    enemiesDefeatedGoalLabel: updated.enemiesDefeatedGoalLabel,
    enemiesDefeatedGoalTarget: updated.enemiesDefeatedGoalTarget,
  }
})
