// server/api/admin/cmoon-enemy-members/[id]/preview.post.js
// Starts a "preview encounter" for an admin testing this member — deliberately NOT a real
// CMoonEnemyBattle: no DB row is ever created for a preview, so it never touches battle logs,
// cMoon points/stats, rewards, or (crucially) the admin's own personal win count, which would
// otherwise silently unlock/relock other members' minPriorDefeats gate for their own real account.
// No body. See preview-action.post.js for how a round is resolved without any persisted state.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { PLAYER_MAX_HP, serializeEnemyForClient } from '@/server/utils/cmoonEnemyBattle'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const member = await db.cMoonEnemyMember.findUnique({
    where: { id },
    include: { faction: { include: { appearEffect: true } } },
  })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  return {
    enemy: serializeEnemyForClient(member),
    state: { playerHpRemaining: PLAYER_MAX_HP, enemyHpRemaining: member.maxHp, roundNumber: 1 },
  }
})
