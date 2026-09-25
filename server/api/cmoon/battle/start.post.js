// server/api/cmoon/battle/start.post.js
// Creates the CMoonEnemyBattle row once a player actually chooses to fight the enemy
// consider.post.js offered them. Body: { enemyMemberId }.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { PLAYER_MAX_HP, ABANDON_AFTER_MINUTES } from '@/server/utils/cmoonEnemyBattle'
import { serializeBattleForClient } from '@/server/utils/cmoonEnemyBattle'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event)
  const enemyMemberId = typeof body?.enemyMemberId === 'string' ? body.enemyMemberId : ''
  if (!enemyMemberId) throw createError({ statusCode: 400, statusMessage: 'Missing enemyMemberId' })

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { cMoonId: true, banned: true, active: true },
  })
  if (!user || user.banned || !user.active) throw createError({ statusCode: 403, statusMessage: 'Not eligible to battle' })
  if (!user.cMoonId) throw createError({ statusCode: 400, statusMessage: 'Join a cMoon before battling' })

  // Reclaim a genuinely-abandoned battle (popup closed mid-fight, no round submitted in a
  // while) instead of leaving the player permanently soft-locked out of ever fighting again.
  const existing = await db.cMoonEnemyBattle.findFirst({
    where: { userId, status: 'IN_PROGRESS' },
    include: { enemyMember: { include: { faction: true } } },
  })
  if (existing) {
    const idleMs = Date.now() - existing.lastActionAt.getTime()
    if (idleMs < ABANDON_AFTER_MINUTES * 60 * 1000) {
      // Still fresh — hand back the existing battle rather than erroring, so a duplicate
      // "Fight!" click (or a second tab) just resumes it instead of failing confusingly.
      return { battle: serializeBattleForClient(existing) }
    }
    await db.cMoonEnemyBattle.update({
      where: { id: existing.id },
      data: { status: 'RESOLVED', outcome: 'ABANDONED', endedAt: new Date(), activeUserId: null },
    })
  }

  const enemyMember = await db.cMoonEnemyMember.findUnique({
    where: { id: enemyMemberId },
    include: { faction: true },
  })
  if (!enemyMember || !enemyMember.active || !enemyMember.faction.active) {
    throw createError({ statusCode: 404, statusMessage: 'That enemy is no longer available' })
  }
  if (enemyMember.battleMode === 'SHARED_POOL' && (enemyMember.defeatedAt || enemyMember.currentHp <= 0)) {
    throw createError({ statusCode: 409, statusMessage: 'This enemy has already been defeated' })
  }

  const enemyHpRemaining = enemyMember.battleMode === 'SHARED_POOL' ? enemyMember.currentHp : enemyMember.maxHp

  let battle
  try {
    battle = await db.cMoonEnemyBattle.create({
      data: {
        userId,
        enemyMemberId: enemyMember.id,
        cMoonId: user.cMoonId,
        playerHpRemaining: PLAYER_MAX_HP,
        enemyHpRemaining,
        activeUserId: userId,
      },
      include: { enemyMember: { include: { faction: true } } },
    })
  } catch (err) {
    // Lost a race against another concurrent /start call for this same user (activeUserId is
    // @unique) — hand back whichever one actually won rather than erroring.
    if (err?.code === 'P2002') {
      const winner = await db.cMoonEnemyBattle.findFirst({
        where: { userId, status: 'IN_PROGRESS' },
        include: { enemyMember: { include: { faction: true } } },
      })
      if (winner) return { battle: serializeBattleForClient(winner) }
    }
    throw err
  }

  return { battle: serializeBattleForClient(battle) }
})
