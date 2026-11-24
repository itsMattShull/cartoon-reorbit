// server/api/admin/daily-streak-rewards/index.post.js — add ONE reward row for a Daily Streak
// milestone day. No uniqueness on `day`: adding a second (or third) row for the same day is how
// an admin stacks multiple rewards (e.g. a pack AND points) on one milestone — see
// DailyStreakReward's own schema comment.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseDailyStreakRewardBody } from '@/server/utils/dailyStreakReward'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseDailyStreakRewardBody(body)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }
  const { rewardType, ctoonId, packId } = parsed.data

  if (rewardType === 'CTOON') {
    const found = await db.ctoon.count({ where: { id: ctoonId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward cToon not found' })
  } else if (rewardType === 'PACK') {
    const found = await db.pack.count({ where: { id: packId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward pack not found' })
  }

  const created = await db.dailyStreakReward.create({ data: parsed.data })

  await logAdminChange(db, {
    userId: me.id,
    area: 'DailyStreakReward',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: parsed.data
  })

  return { id: created.id }
})
