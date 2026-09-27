// server/api/admin/cmoon-season.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { getSeasonConfig } from '@/server/utils/cmoonSeason'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [config, trackers] = await Promise.all([
    getSeasonConfig(),
    db.cMoonSeasonTracker.findMany({ orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }),
  ])

  return {
    header: config.header,
    startedAt: config.startedAt,
    blurb: config.blurb,
    trackers: trackers.map(t => ({
      id: t.id,
      label: t.label,
      metricType: t.metricType,
      targetValue: t.targetValue,
      active: t.active,
      sortOrder: t.sortOrder,
    })),
  }
})
