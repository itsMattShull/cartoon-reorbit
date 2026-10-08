// server/api/admin/cmoon-enemy-factions.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseFactionBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parseFactionBody(body, undefined)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  if (parsed.data.appearEffectId) {
    const effect = await db.cMoonJoinEffect.count({ where: { id: parsed.data.appearEffectId } })
    if (!effect) throw createError({ statusCode: 404, statusMessage: 'Join effect not found' })
  }
  if (parsed.data.specialAttackId) {
    const attack = await db.cMoonSpecialAttack.count({ where: { id: parsed.data.specialAttackId } })
    if (!attack) throw createError({ statusCode: 404, statusMessage: 'Special attack not found' })
  }

  let created
  try {
    created = await db.cMoonEnemyFaction.create({ data: parsed.data })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'An enemy faction with that name already exists' })
    }
    // The effect existed at the count() check above but was deleted by another admin request
    // before this write landed — same race the join-effect delete endpoint's own P2003 catch
    // guards against, just from the other side of the FK.
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 404, statusMessage: 'Join effect was deleted by another request — pick again' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonEnemyFaction', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, name: created.name } })

  return { id: created.id }
})
