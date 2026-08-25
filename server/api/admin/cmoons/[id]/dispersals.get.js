// GET /api/admin/cmoons/[id]/dispersals — recent dispersal history for one cMoon. Used by the
// admin UI both to show past dispersals and to detect an already-in-progress one on open (so
// reopening the modal after backgrounding/navigating away resumes polling instead of offering
// to start a duplicate).
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

const HISTORY_LIMIT = 20

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const cMoonId = event.context.params?.id
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const dispersals = await db.cMoonDispersal.findMany({
    where: { cMoonId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: {
      id: true, ctoonId: true, quantityPerMember: true, status: true,
      totalMembers: true, totalJobs: true, completedJobs: true, failedJobs: true,
      createdAt: true, completedAt: true,
      ctoon: { select: { name: true, assetPath: true } },
      initiatedBy: { select: { username: true } },
    },
  })

  return {
    dispersals: dispersals.map(d => ({
      id: d.id,
      ctoonId: d.ctoonId,
      ctoonName: d.ctoon?.name || '',
      ctoonAssetPath: d.ctoon?.assetPath || null,
      quantityPerMember: d.quantityPerMember,
      status: d.status,
      totalMembers: d.totalMembers,
      totalJobs: d.totalJobs,
      completedJobs: d.completedJobs,
      failedJobs: d.failedJobs,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
      initiatedByUsername: d.initiatedBy?.username || '',
    })),
  }
})
