// server/api/admin/cmoon-season/start-new.post.js
// Moves the season's startedAt to now — every tracker's progress (computed fresh from
// CMoonEnemyBattle/CMoonScoreLog rows dated on/after startedAt, see server/utils/cmoonSeason.js)
// immediately starts counting from zero again. Never deletes any underlying battle/score-log
// history — a past season's raw data is untouched, just outside every tracker's window from here
// on, so this action is non-destructive and can be repeated at will.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { getSeasonConfig, SEASON_CONFIG_ID } from '@/server/utils/cmoonSeason'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const existing = await getSeasonConfig()
  const updated = await db.cMoonSeasonConfig.update({
    where: { id: SEASON_CONFIG_ID },
    data: { startedAt: new Date() },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonSeasonConfig',
    key: 'start-new-season',
    prevValue: { startedAt: existing.startedAt },
    newValue: { startedAt: updated.startedAt },
  })

  return { startedAt: updated.startedAt }
})
