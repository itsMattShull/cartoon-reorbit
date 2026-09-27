// server/api/admin/cmoon-enemy-members/[id]/reset.post.js
// Explicit "revive / refill" action for an enemy member: sets currentHp back to maxHp and clears
// defeatedAt, unconditionally. This is the ONLY way to bring a defeated SHARED_POOL enemy back
// without changing its maxHp — the regular PUT deliberately never does it on an unrelated edit
// (see cmoon-enemy-members/[id].put.js). No body. Harmless no-op in effect for PER_PLAYER members,
// whose currentHp is unused and whose defeatedAt is always null anyway.
//
// Any IN_PROGRESS battles against a SHARED_POOL member keep going against the refilled pool —
// same "leave in-flight battles to finish normally" stance the schema takes for deactivation.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({ where: { id } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const updated = await db.cMoonEnemyMember.update({
    where: { id },
    data: { currentHp: member.maxHp, defeatedAt: null },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyMember',
    key: `reset:${id}`,
    prevValue: { currentHp: member.currentHp, defeatedAt: member.defeatedAt },
    newValue: { currentHp: updated.currentHp, defeatedAt: null },
  })

  return { ok: true, currentHp: updated.currentHp }
})
