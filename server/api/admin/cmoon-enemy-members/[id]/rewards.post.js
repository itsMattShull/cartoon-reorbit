// server/api/admin/cmoon-enemy-members/[id]/rewards.post.js — add ONE possible prize row to an
// enemy member's reward table.
//
// Reward CRUD is individual add (this POST) / remove (DELETE /cmoon-enemy-rewards/:id) rather
// than affinity-levels' "PUT the whole list at once" (see
// cmoons/[id]/affinity-levels/[levelId].put.js's rewardAvatarIds replace). That precedent works
// because its list is bare ids; each row here carries its own type, id-XOR, drop chance and
// quantity, so a bulk replace would need per-row validation with per-row error reporting, a
// delete-all-then-recreate transaction, and would churn every row's id/createdAt on each save.
// Rows are also fully independent (each is rolled on its own, no ordering or normalization across
// the set — see rollEnemyRewards), so there's nothing a whole-list write would keep consistent
// that single-row writes can't. Editing a row is "remove it and add it again" in the admin UI.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseRewardBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const enemyMemberId = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({ where: { id: enemyMemberId }, select: { id: true } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const body = await readBody(event)
  const parsed = parseRewardBody(body)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }
  const { rewardType, ctoonId, avatarId, backgroundId } = parsed.data

  // parseRewardBody guarantees exactly the one id matching rewardType is set; confirm it's real.
  if (rewardType === 'CTOON') {
    const found = await db.ctoon.count({ where: { id: ctoonId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward cToon not found' })
  } else if (rewardType === 'AVATAR') {
    const found = await db.avatar.count({ where: { id: avatarId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward avatar not found' })
  } else if (rewardType === 'BACKGROUND') {
    const found = await db.background.count({ where: { id: backgroundId } })
    if (!found) throw createError({ statusCode: 404, statusMessage: 'Reward background not found' })
  }

  let created
  try {
    created = await db.cMoonEnemyReward.create({ data: { enemyMemberId, ...parsed.data } })
  } catch (err) {
    // The member or the prize existed at the checks above but was deleted by another admin
    // request before this write landed — same race affinity-levels.post.js's P2003 catch covers.
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'The enemy or the prize was deleted by another request — reload and try again' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyReward',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, enemyMemberId, ...parsed.data },
  })

  return { id: created.id }
})
