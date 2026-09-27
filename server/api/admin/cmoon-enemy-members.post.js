// server/api/admin/cmoon-enemy-members.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseMemberBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseMemberBody(body, undefined)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  const faction = await db.cMoonEnemyFaction.count({ where: { id: parsed.data.factionId } })
  if (!faction) throw createError({ statusCode: 404, statusMessage: 'Enemy faction not found' })

  let created
  try {
    created = await db.cMoonEnemyMember.create({
      // currentHp always starts at maxHp regardless of battleMode: the correct starting pool for
      // SHARED_POOL, and simply unused for PER_PLAYER (whose HP lives per-battle instead) — so a
      // later switch to SHARED_POOL never starts from a stale schema-default value.
      data: { ...parsed.data, currentHp: parsed.data.maxHp },
    })
  } catch (err) {
    // Faction existed at the check above but was deleted by another admin request before this
    // write landed.
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 404, statusMessage: 'Enemy faction was deleted by another request — pick again' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyMember',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, factionId: created.factionId, name: created.name, maxHp: created.maxHp, battleMode: created.battleMode, cMoonPointsReward: created.cMoonPointsReward },
  })

  return { id: created.id }
})
