// server/api/admin/cmoons/[id]/ranks/[rankId].delete.js — delete one cMoon rank.
// Blocked while in use, same shape as the cMoon-with-members delete guard: referenced by an
// achievement (the DB's Restrict FK would reject this anyway, but we check first for a
// friendlier message) or currently held by a member (User.currentCMoonRankId is SetNull at
// the DB level, so without this check the delete would silently strip the rank from holders).
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const cMoonId = event.context.params?.id
  const rankId = event.context.params?.rankId
  const rank = await db.cMoonRank.findUnique({ where: { id: rankId } })
  if (!rank || rank.cMoonId !== cMoonId) throw createError({ statusCode: 404, statusMessage: 'Rank not found' })

  const [achievementCount, holderCount] = await Promise.all([
    db.achievement.count({ where: { cMoonRankId: rankId } }),
    db.user.count({ where: { currentCMoonRankId: rankId } }),
  ])
  if (achievementCount > 0) {
    throw createError({ statusCode: 409, statusMessage: `Cannot delete — ${achievementCount} achievement(s) grant this rank. Reassign or delete them first.` })
  }
  if (holderCount > 0) {
    throw createError({ statusCode: 409, statusMessage: `Cannot delete — ${holderCount} member(s) currently hold this rank.` })
  }

  await db.cMoonRank.delete({ where: { id: rankId } })
  await logAdminChange(db, { userId: me.id, area: 'CMoonRank', key: `delete:${rankId}`, prevValue: { name: rank.name }, newValue: null })

  return { ok: true }
})
