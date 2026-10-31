// server/api/admin/cmoon-enemy-members/[id]/wind-up-moves.post.js — add ONE wind-up/telegraph
// move to a raid boss (see CMoonEnemyWindUpMove's own schema comment). Same add-one/remove-one
// shape as rewards.post.js/cmoon-enemy-rewards/[id].delete.js — editing a move in the admin UI is
// "remove it and add it again", for the same reasons that file's own header comment gives.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseWindUpMoveBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const enemyMemberId = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({ where: { id: enemyMemberId }, select: { id: true } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const body = await readBody(event)
  const parsed = parseWindUpMoveBody(body)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  let created
  try {
    created = await db.cMoonEnemyWindUpMove.create({ data: { enemyMemberId, ...parsed.data } })
  } catch (err) {
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'The enemy was deleted by another request — reload and try again' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyWindUpMove',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, enemyMemberId, ...parsed.data },
  })

  return { id: created.id }
})
