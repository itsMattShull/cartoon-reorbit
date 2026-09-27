// server/api/admin/cmoon-enemy-members/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseMemberBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({
    where: { id },
    include: { _count: { select: { battles: true } } },
  })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const body = await readBody(event)
  // hasBattles drives parseMemberBody's battle-mode lock (see its own comment).
  const parsed = parseMemberBody(body, { ...member, hasBattles: (member._count?.battles ?? 0) > 0 })
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }
  const data = { ...parsed.data }

  // Moving a member to another faction is allowed (it's how an admin empties a faction before
  // deleting it), but the target has to exist.
  if (data.factionId !== member.factionId) {
    const faction = await db.cMoonEnemyFaction.count({ where: { id: data.factionId } })
    if (!faction) throw createError({ statusCode: 404, statusMessage: 'Enemy faction not found' })
  }

  // currentHp/defeatedAt are derived, never taken from the body (see parseMemberBody's comment).
  // A SHARED_POOL member's pool restarts at the new maxHp only when the admin is actually
  // re-balancing it — maxHp changed, or it has just been switched to SHARED_POOL (only possible
  // before its first battle) — since leaving the old absolute currentHp in place could exceed the
  // new max or read as nonsense against it. Restarting the pool also clears defeatedAt: a
  // full-HP enemy still flagged defeated would never be offered again. Deliberately NOT done on an
  // unrelated edit (rename, points, active, sortOrder...), which must never quietly revive a
  // defeated shared-pool enemy — that's the explicit reset.post.js action instead.
  const becameSharedPool = data.battleMode === 'SHARED_POOL' && member.battleMode !== 'SHARED_POOL'
  const sharedPoolRebalanced = data.battleMode === 'SHARED_POOL' && data.maxHp !== member.maxHp
  if (becameSharedPool || sharedPoolRebalanced) {
    data.currentHp = data.maxHp
    data.defeatedAt = null
  }
  // defeatedAt is "always null for PER_PLAYER members" (see the schema) — clear any leftover from
  // a SHARED_POOL past when switching back (again only possible before its first battle).
  if (data.battleMode === 'PER_PLAYER' && member.defeatedAt) {
    data.defeatedAt = null
  }

  try {
    await db.cMoonEnemyMember.update({ where: { id }, data })
  } catch (err) {
    // Target faction existed at the check above but was deleted by another admin request before
    // this write landed.
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 404, statusMessage: 'Enemy faction was deleted by another request — pick again' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyMember',
    key: `update:${id}`,
    prevValue: { factionId: member.factionId, name: member.name, maxHp: member.maxHp, battleMode: member.battleMode, cMoonPointsReward: member.cMoonPointsReward, active: member.active, currentHp: member.currentHp },
    newValue: { factionId: data.factionId, name: data.name, maxHp: data.maxHp, battleMode: data.battleMode, cMoonPointsReward: data.cMoonPointsReward, active: data.active, currentHp: data.currentHp ?? member.currentHp },
  })

  return { ok: true }
})
