// GET /api/admin/cmoons/[id]/dispersals/[dispersalId] — lightweight summary/status for one
// dispersal. This is the polling target while a dispersal is PROCESSING; it deliberately returns
// only aggregate counts (not the per-member list) so polling every few seconds stays cheap even
// for a cMoon with hundreds of members — see recipients.get.js for the on-demand full list.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const cMoonId = event.context.params?.id
  const dispersalId = event.context.params?.dispersalId
  if (!cMoonId || !dispersalId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const d = await db.cMoonDispersal.findUnique({
    where: { id: dispersalId },
    select: {
      id: true, cMoonId: true, ctoonId: true, quantityPerMember: true, status: true,
      totalMembers: true, totalJobs: true, completedJobs: true, failedJobs: true,
      createdAt: true, completedAt: true,
      ctoon: { select: { name: true, assetPath: true } },
      initiatedBy: { select: { username: true } },
    },
  })
  // Scope check: a dispersalId must resolve under the cMoon named in the URL, or this becomes
  // an IDOR letting any admin walk dispersalIds to read another cMoon's recipient data.
  if (!d || d.cMoonId !== cMoonId) throw createError({ statusCode: 404, statusMessage: 'Dispersal not found' })

  return {
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
  }
})
