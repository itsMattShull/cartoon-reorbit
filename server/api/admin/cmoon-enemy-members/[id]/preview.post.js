// server/api/admin/cmoon-enemy-members/[id]/preview.post.js
// Starts a "preview encounter" for an admin testing this member — deliberately NOT a real
// CMoonEnemyBattle: no DB row is ever created for a preview, so it never touches battle logs,
// cMoon points/stats, rewards, or (crucially) the admin's own personal win count, which would
// otherwise silently unlock/relock other members' minPriorDefeats gate for their own real account.
// No body. See preview-action.post.js for how a round is resolved without any persisted state.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { serializeEnemyForClient } from '@/server/utils/cmoonEnemyBattle'
import { getPlayerCombatMaxHp } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({
    where: { id },
    include: { faction: { include: { appearEffect: true } } },
  })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  // No userId — this preview is deliberately NOT personalized by the admin's own cMoon rank (see
  // this file's own header comment on why nothing here ever touches a real account's state); it
  // always reflects the plain admin-configured default, same experience for every admin.
  const playerMaxHp = await getPlayerCombatMaxHp(null)

  return {
    enemy: serializeEnemyForClient(member),
    state: { playerHpRemaining: playerMaxHp, playerMaxHp, enemyHpRemaining: member.maxHp, roundNumber: 1 },
  }
})
