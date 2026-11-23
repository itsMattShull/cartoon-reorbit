// server/api/admin/daily-streak-settings.get.js — read-only companion to the POST endpoint, so
// the admin UI can load the current toggle without a write, same shape as
// cmoon-pvp-settings.get.js.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const config = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { dailyStreakRepeatEnabled: true }
  })

  return { dailyStreakRepeatEnabled: !!config?.dailyStreakRepeatEnabled }
})
