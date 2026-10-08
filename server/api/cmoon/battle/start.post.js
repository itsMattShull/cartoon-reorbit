// server/api/cmoon/battle/start.post.js
// Creates the CMoonEnemyBattle row once a player actually chooses to fight the enemy
// consider.post.js offered them. Body: { enemyMemberId }.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { getGlobalConfig, getPlayerCombatMaxHp } from '@/server/utils/cmoon'
import { ABANDON_AFTER_MINUTES } from '@/server/utils/cmoonEnemyBattle'
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
  // No cMoon membership required to fight — a player with no cMoon just can't earn cMoon points
  // (battle.cMoonId stays null; see resolveWin in action.post.js), every other reward and
  // achievement progress still applies normally.

  // Reclaim a genuinely-abandoned battle (popup closed mid-fight, no round submitted in a
  // while) instead of leaving the player permanently soft-locked out of ever fighting again.
  const existing = await db.cMoonEnemyBattle.findFirst({
    where: { userId, status: 'IN_PROGRESS' },
    include: { enemyMember: { include: { faction: { include: { appearEffect: true } } } }, cMoon: { include: { specialAttack: true } } },
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

  // Backstop for consider.post.js's own gate: that endpoint never offers a NEW encounter while
  // the feature is off, but this endpoint is reachable directly, so a stale "Fight!" prompt still
  // on screen from before an admin disabled it must not be able to start one. Resuming an
  // already-IN_PROGRESS battle above is unaffected — only starting a fresh one is blocked.
  const config = await getGlobalConfig()
  if (!config?.cMoonEnemyBattlesEnabled) {
    throw createError({ statusCode: 403, statusMessage: 'cMoon Enemy Battles is currently disabled' })
  }

  const enemyMember = await db.cMoonEnemyMember.findUnique({
    where: { id: enemyMemberId },
    include: { faction: { include: { appearEffect: true } } },
  })
  if (!enemyMember || !enemyMember.active || !enemyMember.faction.active) {
    throw createError({ statusCode: 404, statusMessage: 'That enemy is no longer available' })
  }
  // Raid bosses are only ever fought through the socket-driven co-op flow (see
  // server/utils/cmoonRaidSocket.js) — this solo/stateless endpoint must never create a
  // CMoonEnemyBattle row for one, even if a client fabricates the request directly.
  if (enemyMember.isRaidBoss) {
    throw createError({ statusCode: 409, statusMessage: 'This enemy must be fought as a raid — use the raid button' })
  }
  if (enemyMember.battleMode === 'SHARED_POOL' && (enemyMember.defeatedAt || enemyMember.currentHp <= 0)) {
    throw createError({ statusCode: 409, statusMessage: 'This enemy has already been defeated' })
  }
  // A player mid-raid must resolve it before starting an unrelated solo fight — the raid's own
  // CMoonEnemyRaidParticipant.activeUserId sentinel is the real backstop; this is a friendlier
  // upfront message for the common case.
  const activeRaid = await db.cMoonEnemyRaidParticipant.findFirst({
    where: { userId, activeUserId: userId },
    select: { id: true },
  })
  if (activeRaid) {
    throw createError({ statusCode: 409, statusMessage: 'Finish your current raid before starting a solo battle' })
  }

  // Backstop for consider.post.js's own candidate filter, same reasoning as the feature-toggle
  // check above: this endpoint takes an explicit enemyMemberId and is reachable directly, so a
  // player who never actually saw this enemy offered (or fabricated the id) must still be turned
  // away if they haven't personally cleared the required number of prior wins.
  if (enemyMember.minPriorDefeats > 0) {
    const personalWinCount = await db.cMoonEnemyBattle.count({ where: { userId, outcome: 'WIN' } })
    if (personalWinCount < enemyMember.minPriorDefeats) {
      throw createError({ statusCode: 403, statusMessage: 'You have not defeated enough enemies to face this one yet' })
    }
  }

  const enemyHpRemaining = enemyMember.battleMode === 'SHARED_POOL' ? enemyMember.currentHp : enemyMember.maxHp
  // Snapshotted once at battle-start — see CMoonEnemyBattle.playerMaxHp's own schema comment on
  // why this is never re-read live mid-fight.
  const playerMaxHp = await getPlayerCombatMaxHp(userId, config)

  let battle
  try {
    battle = await db.cMoonEnemyBattle.create({
      data: {
        userId,
        enemyMemberId: enemyMember.id,
        cMoonId: user.cMoonId,
        playerHpRemaining: playerMaxHp,
        playerMaxHp,
        enemyHpRemaining,
        activeUserId: userId,
      },
      include: { enemyMember: { include: { faction: { include: { appearEffect: true } } } }, cMoon: { include: { specialAttack: true } } },
    })
  } catch (err) {
    // Lost a race against another concurrent /start call for this same user (activeUserId is
    // @unique) — hand back whichever one actually won rather than erroring.
    if (err?.code === 'P2002') {
      const winner = await db.cMoonEnemyBattle.findFirst({
        where: { userId, status: 'IN_PROGRESS' },
        include: { enemyMember: { include: { faction: { include: { appearEffect: true } } } }, cMoon: { include: { specialAttack: true } } },
      })
      if (winner) return { battle: serializeBattleForClient(winner) }
    }
    throw err
  }

  return { battle: serializeBattleForClient(battle) }
})
