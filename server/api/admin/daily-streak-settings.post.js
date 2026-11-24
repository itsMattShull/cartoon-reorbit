// server/api/admin/daily-streak-settings.post.js — dedicated toggle endpoint for the Daily
// Streak feature, kept separate from any general global-config endpoint, same "keep each feature
// area independently rip-out-able" rationale cmoon-pvp-settings.post.js's own header gives.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  if (body?.dailyStreakRepeatEnabled === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'dailyStreakRepeatEnabled is required' })
  }

  const existing = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  const data = { dailyStreakRepeatEnabled: !!body.dailyStreakRepeatEnabled }

  const updated = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 100, ...data },
    update: data
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'DailyStreak',
    key: 'dailyStreakRepeatEnabled',
    prevValue: { dailyStreakRepeatEnabled: existing?.dailyStreakRepeatEnabled },
    newValue: { dailyStreakRepeatEnabled: updated.dailyStreakRepeatEnabled }
  })

  return { dailyStreakRepeatEnabled: updated.dailyStreakRepeatEnabled }
})
