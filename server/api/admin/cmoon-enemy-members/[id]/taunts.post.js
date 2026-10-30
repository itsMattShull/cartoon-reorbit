// server/api/admin/cmoon-enemy-members/[id]/taunts.post.js — add ONE unique taunt line to a
// single enemy member's own taunt pool (CMoonEnemyMemberTaunt). Same add-one/remove-one shape as
// cmoon-enemy-factions/[id]/taunts.post.js (that pool's faction-wide sibling) — see that file's
// own header comment for why a bulk "replace the whole list" endpoint isn't used here either.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseTauntBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const enemyMemberId = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({ where: { id: enemyMemberId }, select: { id: true } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const body = await readBody(event)
  const parsed = parseTauntBody(body, undefined)
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: parsed.message })
  }

  let created
  try {
    created = await db.cMoonEnemyMemberTaunt.create({ data: { enemyMemberId, ...parsed.data } })
  } catch (err) {
    // The member existed at the lookup above but was deleted by another admin request before
    // this write landed — same race rewards.post.js's own P2003 catch covers.
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'The enemy was deleted by another request — reload and try again' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyMemberTaunt',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, enemyMemberId, ...parsed.data },
  })

  return { id: created.id }
})
