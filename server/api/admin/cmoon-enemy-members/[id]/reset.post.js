// server/api/admin/cmoon-enemy-members/[id]/reset.post.js
// Explicit "revive" action for an enemy member — clears whichever of the two independent
// "is it dead" flags this member actually has set:
//   - SHARED_POOL solo battles: currentHp back to maxHp, defeatedAt cleared.
//   - A raid boss with raidOneTime (or just mid-cooldown): raidDefeatedAt cleared, immediately
//     making it raidable again regardless of raidCooldownMinutes.
// A member can in principle have both set at once (SHARED_POOL and isRaidBoss aren't mutually
// exclusive) — this clears both, unconditionally. This is the ONLY way to bring either back
// without changing maxHp — the regular PUT deliberately never does it on an unrelated edit (see
// cmoon-enemy-members/[id].put.js). No body. Harmless no-op for a member with neither set.
//
// Any IN_PROGRESS battles/raids against this member keep going against the refilled pool — same
// "leave in-flight fights to finish normally" stance the schema takes for deactivation.
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
    data: { currentHp: member.maxHp, defeatedAt: null, raidDefeatedAt: null },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyMember',
    key: `reset:${id}`,
    prevValue: { currentHp: member.currentHp, defeatedAt: member.defeatedAt, raidDefeatedAt: member.raidDefeatedAt },
    newValue: { currentHp: updated.currentHp, defeatedAt: null, raidDefeatedAt: null },
  })

  return { ok: true, currentHp: updated.currentHp }
})
