// server/api/admin/cmoon-enemy-factions/[id]/taunts.post.js — add ONE taunt line to a faction's
// taunt pool. Same add-one/remove-one shape as cmoon-enemy-members/[id]/rewards.post.js (see that
// file's own header comment for why a bulk "replace the whole list" endpoint isn't used here
// either) — each taunt is independently picked at random from its trigger's pool, so there's
// nothing a whole-list write would keep consistent that single-row writes can't.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseTauntBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const factionId = event.context.params?.id
  const faction = await db.cMoonEnemyFaction.findUnique({ where: { id: factionId }, select: { id: true } })
  if (!faction) throw createError({ statusCode: 404, statusMessage: 'Enemy faction not found' })

  const body = await readBody(event)
  const parsed = parseTauntBody(body, undefined)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  let created
  try {
    created = await db.cMoonEnemyTaunt.create({ data: { factionId, ...parsed.data } })
  } catch (err) {
    // The faction existed at the lookup above but was deleted by another admin request before
    // this write landed — same race rewards.post.js's own P2003 catch covers.
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'The faction was deleted by another request — reload and try again' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyTaunt',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, factionId, ...parsed.data },
  })

  return { id: created.id }
})
