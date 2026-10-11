// server/api/admin/cmoons/award-points.post.js
// Admin tool: awards (or deducts, via a negative amount) cMoon points to exactly one target —
// a single player, or a single cMoon's team total with no specific player attached — unlike
// every other point-awarding path in this codebase, which is either fully automated
// (High Score/Top 10/Daily Task/riddles/hunts/battles) or a blanket grant to every member at
// once ("Backfill cMoon Points"). See CMoonScoreLog's own schema comment for the row shape.
//
// `targetType: 'team'` writes a CMoonScoreLog row with userId left null. recomputeCMoonTeamScores
// sums every row for a cMoon with no userId filter, so this still rolls into the team's
// teamScore — but every per-player aggregate (recomputeCMoonPointsForUsers, the rank-recalc
// worker, the live cron) joins on `csl."userId" = u.id`, which a null userId can never satisfy,
// so a team-only grant deliberately never touches any individual member's cMoonPoints or rank.
// That's the whole mechanism behind "just the team, not any one player's rank" — no separate
// code path needed for it.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { recomputeCMoonTeamScores } from '@/server/utils/cmoon'
import { recomputeCMoonPointsForUsers } from '@/server/cron/cmoon-points-aggregate'

const POINTS_MAX_MAGNITUDE = 100000
const REASON_MAX_LENGTH = 300

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const targetType = body?.targetType
  if (targetType !== 'user' && targetType !== 'team') {
    throw createError({ statusCode: 400, statusMessage: '"targetType" must be "user" or "team"' })
  }

  const points = Number(body?.points)
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > POINTS_MAX_MAGNITUDE) {
    throw createError({
      statusCode: 400,
      statusMessage: `"points" must be a non-zero whole number, at most ${POINTS_MAX_MAGNITUDE} in magnitude`,
    })
  }

  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, REASON_MAX_LENGTH) : ''

  let cMoonId
  let userId = null
  let targetLabel

  if (targetType === 'user') {
    userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
    if (!userId) throw createError({ statusCode: 400, statusMessage: 'Missing "userId"' })

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, cMoonId: true },
    })
    if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })
    if (!user.cMoonId) throw createError({ statusCode: 400, statusMessage: 'This player is not currently in a cMoon' })
    cMoonId = user.cMoonId
    targetLabel = user.username
  } else {
    cMoonId = typeof body?.cMoonId === 'string' ? body.cMoonId.trim() : ''
    if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'Missing "cMoonId"' })

    const cMoon = await db.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true } })
    if (!cMoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
    targetLabel = cMoon.name
  }

  // One-off manual award, not a cron re-run — weekStart just needs to be "now" (see
  // RIDDLE_SOLVE/HUNT_COMPLETE/ENEMY_BATTLE_WIN's own CMoonScoreLog.create calls for the same
  // convention); nothing dedupes against it the way a scheduled job's own weekStart does.
  const created = await db.cMoonScoreLog.create({
    data: { cMoonId, userId, category: 'ADMIN_GRANT', detail: reason || null, points, weekStart: new Date() },
  })

  await recomputeCMoonTeamScores()
  if (targetType === 'user') await recomputeCMoonPointsForUsers([userId])

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonScoreLog',
    key: `award:${created.id}`,
    prevValue: null,
    newValue: { targetType, userId, cMoonId, points, reason: reason || null },
  })

  return { id: created.id, targetType, targetLabel, cMoonId, userId, points }
})
