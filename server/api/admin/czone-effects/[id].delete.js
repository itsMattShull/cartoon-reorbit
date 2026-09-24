// server/api/admin/czone-effects/[id].delete.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const effect = await db.cZoneEffect.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          affinityLevelsAsBorder: true,
          affinityLevelsAsGlow: true,
          grantedBorders: true,
          grantedGlows: true,
        },
      },
    },
  })
  if (!effect) throw createError({ statusCode: 404, statusMessage: 'cZone effect not found' })

  // Friendly pre-check message; the FKs' ON DELETE RESTRICT (see CMoonAffinityLevel.borderEffect
  // and UserCMoonBorder.effect in prisma/schema.prisma) is the real race-proof backstop below,
  // same pattern as server/api/admin/cmoon-join-effects/[id].delete.js's own P2003 catch — this
  // check and the delete itself are separate statements, so another admin could assign or grant
  // this effect in between.
  const { affinityLevelsAsBorder, affinityLevelsAsGlow, grantedBorders, grantedGlows } = effect._count || {}
  const usageCount = (affinityLevelsAsBorder ?? 0) + (affinityLevelsAsGlow ?? 0) + (grantedBorders ?? 0) + (grantedGlows ?? 0)
  if (usageCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Cannot delete — this effect is assigned to an affinity level and/or already granted to a player. Unassign it first.',
    })
  }

  try {
    await db.cZoneEffect.delete({ where: { id } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'Cannot delete — this effect is still assigned or granted. Unassign it first.' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CZoneEffect', key: `delete:${id}`, prevValue: { name: effect.name }, newValue: null })

  return { ok: true }
})
