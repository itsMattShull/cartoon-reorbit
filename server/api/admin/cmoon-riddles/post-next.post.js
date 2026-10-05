// server/api/admin/cmoon-riddles/post-next.post.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { postNextWeeklyRiddle } from '@/server/cron/cmoon-riddle-rotation'

// Manual override for the weekly rotation (see server/cron/cmoon-riddle-rotation.js) — runs the
// exact same posting logic, just without waiting for the scheduled day/hour/minute. Does not
// touch GlobalGameConfig.cMoonRiddleLastPostedFor, since that field is the SCHEDULED job's own
// idempotency bookkeeping, not this manual action's.
export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const result = await postNextWeeklyRiddle()

  await logAdminChange(db, { userId: me.id, area: 'CMoonRiddle', key: 'post-next', prevValue: null, newValue: result })

  return result
})
