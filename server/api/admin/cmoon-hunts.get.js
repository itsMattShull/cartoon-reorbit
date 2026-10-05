// server/api/admin/cmoon-hunts.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [hunts, config] = await Promise.all([
    db.cMoonHunt.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        clues: { orderBy: { sortOrder: 'asc' }, select: { id: true, sortOrder: true, text: true } },
        _count: { select: { assignments: true, completions: true } },
      },
    }),
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { cMoonHuntPoints: true } }),
  ])

  return {
    cMoonHuntPoints: config?.cMoonHuntPoints ?? 75,
    hunts: hunts.map(h => ({
      id: h.id,
      title: h.title,
      finalAnswer: h.finalAnswer,
      active: h.active,
      postedAt: h.postedAt,
      createdAt: h.createdAt,
      clues: h.clues,
      assignedCount: h._count.assignments,
      completedCount: h._count.completions,
    })),
  }
})
