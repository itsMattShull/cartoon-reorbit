// server/api/admin/cmoon-prestige-levels.get.js — list the admin-defined prestige ladder (see
// prisma/schema.prisma's CMoonPrestigeLevel comment).
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const levels = await db.cMoonPrestigeLevel.findMany({ orderBy: { level: 'asc' } })

  return {
    levels: levels.map(l => ({
      id: l.id,
      level: l.level,
      pointThreshold: l.pointThreshold,
      title: l.title,
    })),
  }
})
