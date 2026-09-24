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

  // The FKs referencing this row are all ON DELETE SET NULL (a player's already-granted
  // border/glow shouldn't vanish or crash just because an admin deletes the effect it was styled
  // with — see UserCMoonBorder.effectId's comment), so nothing here will actually fail at the DB
  // layer. Block it at the app layer instead: deleting an in-use effect would silently strip the
  // styling from every affinity level assignment and every player who already has it equipped,
  // reverting them all to the plain legacy solid-color ring with no admin review of that change.
  const { affinityLevelsAsBorder, affinityLevelsAsGlow, grantedBorders, grantedGlows } = effect._count || {}
  const usageCount = (affinityLevelsAsBorder ?? 0) + (affinityLevelsAsGlow ?? 0) + (grantedBorders ?? 0) + (grantedGlows ?? 0)
  if (usageCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Cannot delete — this effect is assigned to an affinity level and/or already granted to a player. Unassign it first.',
    })
  }

  await db.cZoneEffect.delete({ where: { id } })

  await logAdminChange(db, { userId: me.id, area: 'CZoneEffect', key: `delete:${id}`, prevValue: { name: effect.name }, newValue: null })

  return { ok: true }
})
