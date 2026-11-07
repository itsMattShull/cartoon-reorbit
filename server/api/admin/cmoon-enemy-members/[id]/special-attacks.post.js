// server/api/admin/cmoon-enemy-members/[id]/special-attacks.post.js — add ONE special-attack
// override row to an enemy member (solo or raid boss). When a member has one or more of these
// rows, they ALWAYS win over its faction's single shared specialAttack — see
// CMoonEnemyMemberSpecialAttack's own schema comment and pickEnemySpecialAttack in
// cmoonEnemyBattle.js. Same add-one/remove-one shape as rewards.post.js's own comment explains for
// CMoonEnemyReward — each row is independent (no ordering/normalization across the set beyond the
// weighted roll itself), so there's nothing a whole-list write would keep consistent that a
// single-row write can't.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseMemberSpecialAttackBody } from '@/server/utils/cmoonEnemy'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const enemyMemberId = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({ where: { id: enemyMemberId }, select: { id: true } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const body = await readBody(event)
  const parsed = parseMemberSpecialAttackBody(body)
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.message })

  const attack = await db.cMoonSpecialAttack.count({ where: { id: parsed.data.specialAttackId } })
  if (!attack) throw createError({ statusCode: 404, statusMessage: 'Special attack not found' })

  let created
  try {
    created = await db.cMoonEnemyMemberSpecialAttack.create({ data: { enemyMemberId, ...parsed.data } })
  } catch (err) {
    // Already assigned to this member — same unique-constraint race shape every other add-one
    // admin endpoint in this feature already handles (see rewards.post.js's P2003 catch).
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'This special attack is already assigned to this enemy' })
    }
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 409, statusMessage: 'The enemy or the attack was deleted by another request — reload and try again' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonEnemyMemberSpecialAttack',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, enemyMemberId, ...parsed.data },
  })

  return { id: created.id }
})
