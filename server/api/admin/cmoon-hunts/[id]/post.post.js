// server/api/admin/cmoon-hunts/[id]/post.post.js
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { postCMoonHunt } from '@/server/utils/cmoonHunt'

// Manual trigger for a staged (authored-but-not-yet-posted) hunt — sets it active if it wasn't
// already and runs the same DM-every-member-their-clue distribution a rising active edge in the
// PUT endpoint would. No-ops (posted: false) if this hunt already went out.
export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const hunt = await db.cMoonHunt.findUnique({ where: { id } })
  if (!hunt) throw createError({ statusCode: 404, statusMessage: 'Hunt not found' })

  if (!hunt.active) await db.cMoonHunt.update({ where: { id }, data: { active: true } })

  const result = await postCMoonHunt(db, id)

  await logAdminChange(db, { userId: me.id, area: 'CMoonHunt', key: `post:${id}`, prevValue: null, newValue: result })

  return result
})
