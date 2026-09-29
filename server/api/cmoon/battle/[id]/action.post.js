// server/api/cmoon/battle/[id]/action.post.js
// Resolves ONE round of an in-progress cMoon Enemy Battle. Body: { action, roundNumber }.
// `action` is the ONLY thing ever trusted from the client — the enemy's move is always rolled
// here, server-side, and every HP change is computed from that roll plus the player's action,
// never from anything the client asserts about the outcome. `roundNumber` is a staleness/replay
// guard (see the atomic claim below), not itself trusted for anything else.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { grantRewardInTx, enqueueCtoonJobs, processAchievementsForUser } from '@/server/utils/achievements'
import { recomputeCMoonPointsForUsers } from '@/server/cron/cmoon-points-aggregate'
import {
  isValidBattleAction, resolveBattleRound, rollEnemyAction, rollEnemyRewards, buildGrantableReward,
  rollHitDamage, serializeBattleForClient, MAX_ROUNDS_SAFETY, PLAYER_MAX_HP, HEAL_ON_SUCCESSFUL_BLOCK,
} from '@/server/utils/cmoonEnemyBattle'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const battleId = event.context.params?.id
  if (!battleId) throw createError({ statusCode: 400, statusMessage: 'Missing battle id' })

  const body = await readBody(event)
  const playerAction = body?.action
  const submittedRound = Number(body?.roundNumber)
  if (!isValidBattleAction(playerAction)) throw createError({ statusCode: 400, statusMessage: 'Invalid action' })
  if (!Number.isInteger(submittedRound) || submittedRound < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid roundNumber' })
  }

  const battle = await db.cMoonEnemyBattle.findUnique({
    where: { id: battleId },
    include: { enemyMember: { include: { faction: { include: { appearEffect: true } } } } },
  })
  if (!battle || battle.userId !== userId) throw createError({ statusCode: 404, statusMessage: 'Battle not found' })
  if (battle.status !== 'IN_PROGRESS') throw createError({ statusCode: 409, statusMessage: 'This battle has already ended' })

  // Atomically claim this round: only succeeds if the battle is still exactly where the client
  // thinks it is. A stale resubmission (double-click, retried request after a slow response
  // already landed) matches nothing and is rejected — it can never apply a second time.
  const claim = await db.cMoonEnemyBattle.updateMany({
    where: { id: battleId, userId, status: 'IN_PROGRESS', roundNumber: submittedRound },
    data: { lastActionAt: new Date() },
  })
  if (claim.count === 0) throw createError({ statusCode: 409, statusMessage: 'Stale round — reload this battle' })

  const enemyAction = rollEnemyAction()
  const { playerHit, enemyHit, playerBlocked, enemyBlocked } = resolveBattleRound(playerAction, enemyAction)
  const isSharedPool = battle.enemyMember.battleMode === 'SHARED_POOL'

  // Damage: a landed hit rolls against the RELEVANT side's own crit chance for 1 or 2 damage (see
  // rollHitDamage's own comment). critChanceFromPercent is this enemy's own attacks landing
  // critically against the player; critChanceAgainstPercent is the player's attacks landing
  // critically against this enemy.
  const { damage: playerDamage, isCrit: playerCrit } = rollHitDamage(playerHit, battle.enemyMember.critChanceFromPercent)
  const { damage: enemyDamage, isCrit: enemyCrit } = rollHitDamage(enemyHit, battle.enemyMember.critChanceAgainstPercent)

  // A successful block heals 1 HP (never on a round with no attack to block — see
  // resolveBattleRound's own comment on playerBlocked/enemyBlocked) — mutually exclusive with
  // taking damage, since a block that actually stops the attack is exactly what "not hit" means.
  let newPlayerHp = battle.playerHpRemaining
  if (playerHit) newPlayerHp = Math.max(0, newPlayerHp - playerDamage)
  else if (playerBlocked) newPlayerHp = Math.min(PLAYER_MAX_HP, newPlayerHp + HEAL_ON_SUCCESSFUL_BLOCK)

  let newEnemyHp

  if (isSharedPool) {
    // Check the LIVE pool first — another player may have already finished this enemy off
    // between this player's previous round and now. If so, this player still gets credit for
    // having chipped away at it (their battle resolves as a WIN here) rather than being left
    // "fighting" an enemy that's already dead with no way to know it.
    const live = await db.cMoonEnemyMember.findUnique({ where: { id: battle.enemyMemberId }, select: { currentHp: true, maxHp: true } })
    if (live.currentHp <= 0) {
      newEnemyHp = 0
    } else if (enemyHit) {
      // Atomic conditional decrement, clamped at 0 in the same statement (GREATEST) so a crit's
      // 2 damage against a pool with only 1 HP left can't write a negative value — WHERE
      // currentHp > 0 still means at most ONE concurrent hit can ever be the one that brings it
      // to exactly 0 (Postgres serializes concurrent UPDATEs on the same row), so two players
      // landing a killing blow at the same instant can never both "win the race".
      const rows = await db.$queryRaw`
        UPDATE "CMoonEnemyMember" SET "currentHp" = GREATEST("currentHp" - ${enemyDamage}, 0)
        WHERE id = ${battle.enemyMemberId} AND "currentHp" > 0
        RETURNING "currentHp"
      `
      if (rows.length) {
        newEnemyHp = rows[0].currentHp
        if (newEnemyHp <= 0) {
          await db.cMoonEnemyMember.update({ where: { id: battle.enemyMemberId }, data: { defeatedAt: new Date() } })
        }
      } else {
        newEnemyHp = 0 // someone else's hit landed in the instant between our live-check and this UPDATE
      }
    } else if (enemyBlocked) {
      // Symmetric heal-on-block for a shared pool: whichever player's successful block triggers
      // it, the one running total goes up for everyone still fighting it — the same "cMoons work
      // together" shape SHARED_POOL already has for damage. WHERE currentHp > 0 avoids reviving a
      // pool another player's concurrent hit just brought to 0 in the same instant.
      const rows = await db.$queryRaw`
        UPDATE "CMoonEnemyMember" SET "currentHp" = LEAST("currentHp" + ${HEAL_ON_SUCCESSFUL_BLOCK}, "maxHp")
        WHERE id = ${battle.enemyMemberId} AND "currentHp" > 0
        RETURNING "currentHp"
      `
      newEnemyHp = rows.length ? rows[0].currentHp : 0
    } else {
      newEnemyHp = live.currentHp
    }
  } else {
    newEnemyHp = battle.enemyHpRemaining
    if (enemyHit) newEnemyHp = Math.max(0, newEnemyHp - enemyDamage)
    else if (enemyBlocked) newEnemyHp = Math.min(battle.enemyMember.maxHp, newEnemyHp + HEAL_ON_SUCCESSFUL_BLOCK)
  }

  const roundEntry = {
    round: submittedRound, playerAction, enemyAction, playerHit, enemyHit,
    playerBlocked, enemyBlocked, playerCrit, enemyCrit,
  }
  const roundLog = [...(Array.isArray(battle.roundLog) ? battle.roundLog : []), roundEntry]

  // WIN takes priority over a same-round mutual KO (both sides would have hit 0 hp this round)
  // — the player still gets credit for the kill rather than being denied a reward on a technicality.
  if (newEnemyHp <= 0) {
    const result = await resolveWin(battle, roundLog, submittedRound)
    return { round: roundEntry, battle: serializeBattleForClient(result) }
  }
  if (newPlayerHp <= 0) {
    const result = await resolveLoss(battle, roundLog, submittedRound)
    return { round: roundEntry, battle: serializeBattleForClient(result) }
  }
  // Neither side reached 0 this round — under a pathological RNG streak (see this constant's own
  // comment) a battle could otherwise run indefinitely, one round per request, so cap it here the
  // same way an idle timeout does: no penalty, just ended.
  if (submittedRound + 1 >= MAX_ROUNDS_SAFETY) {
    const result = await resolveAbandoned(battle, roundLog, submittedRound, newPlayerHp, newEnemyHp)
    return { round: roundEntry, battle: serializeBattleForClient(result) }
  }

  const updated = await db.cMoonEnemyBattle.update({
    where: { id: battleId },
    data: { roundNumber: submittedRound + 1, playerHpRemaining: newPlayerHp, enemyHpRemaining: newEnemyHp, roundLog },
    include: { enemyMember: { include: { faction: { include: { appearEffect: true } } } } },
  })
  return { round: roundEntry, battle: serializeBattleForClient(updated) }
})

async function resolveWin(battle, roundLog, submittedRound) {
  const rewardRows = await db.cMoonEnemyReward.findMany({
    where: { enemyMemberId: battle.enemyMemberId },
    include: { ctoon: { select: { quantity: true, name: true } } },
  })
  const hitRewards = rollEnemyRewards(rewardRows)
  const grantable = buildGrantableReward(hitRewards)
  const pointsAwarded = Math.max(0, Number(battle.enemyMember.cMoonPointsReward) || 0)

  const txResult = await db.$transaction(async (tx) => {
    const summary = await grantRewardInTx(tx, battle.userId, grantable, 'CMOON_ENEMY_BATTLE_WIN')

    if (pointsAwarded > 0) {
      // cMoonPoints is a fully-recomputed aggregate (see server/cron/cmoon-points-aggregate.js),
      // never incremented directly — a direct increment here would just get silently overwritten
      // on that job's next tick. A CMoonScoreLog row is the only correct way to award it; this
      // also naturally flows into the cMoon's teamScore on its own next recompute, matching
      // "cMoons work together" better than a purely personal stat would.
      await tx.cMoonScoreLog.create({
        data: {
          cMoonId: battle.cMoonId, userId: battle.userId, category: 'ENEMY_BATTLE_WIN',
          detail: battle.id, points: pointsAwarded, weekStart: new Date(),
        },
      })
    }

    await tx.cMoon.update({ where: { id: battle.cMoonId }, data: { battleWins: { increment: 1 } } })

    const rewardsGranted = [
      ...(summary.points ? [{ type: 'POINTS', quantity: summary.points }] : []),
      ...(summary.backgrounds ? [{ type: 'BACKGROUND', quantity: summary.backgrounds }] : []),
      ...(summary.avatars ? [{ type: 'AVATAR', quantity: summary.avatars }] : []),
      ...summary.ctoonJobs.map(j => ({ type: 'CTOON', name: j.name, quantity: j.quantity })),
    ]

    const updated = await tx.cMoonEnemyBattle.update({
      where: { id: battle.id },
      data: {
        status: 'RESOLVED', outcome: 'WIN', roundNumber: submittedRound + 1,
        playerHpRemaining: battle.playerHpRemaining, enemyHpRemaining: 0,
        roundLog, pointsAwarded, rewardsGranted, endedAt: new Date(), activeUserId: null,
      },
      include: { enemyMember: { include: { faction: { include: { appearEffect: true } } } } },
    })

    return { updated, ctoonJobs: summary.ctoonJobs }
  })

  if (txResult.ctoonJobs.length) await enqueueCtoonJobs(battle.userId, txResult.ctoonJobs, 'CMOON_ENEMY_BATTLE_WIN')
  if (pointsAwarded > 0) await recomputeCMoonPointsForUsers([battle.userId])
  // Fire-and-forget, same pattern server/api/tko/event.post.js uses right after its own win is
  // persisted — checks every active achievement (e.g. "defeat N cMoon enemies") against this
  // player's now-updated stats and awards any newly met. Never awaited: a slow/failed check must
  // not hold up or fail the battle response the player is waiting on.
  processAchievementsForUser(battle.userId).catch(() => {})

  return txResult.updated
}

async function resolveLoss(battle, roundLog, submittedRound) {
  return db.$transaction(async (tx) => {
    await tx.cMoon.update({ where: { id: battle.cMoonId }, data: { battleLosses: { increment: 1 } } })
    return tx.cMoonEnemyBattle.update({
      where: { id: battle.id },
      data: {
        status: 'RESOLVED', outcome: 'LOSS', roundNumber: submittedRound + 1,
        playerHpRemaining: 0, enemyHpRemaining: battle.enemyHpRemaining,
        roundLog, endedAt: new Date(), activeUserId: null,
      },
      include: { enemyMember: { include: { faction: { include: { appearEffect: true } } } } },
    })
  })
}

// MAX_ROUNDS_SAFETY was reached with neither side at 0 — ends the battle the same way the idle
// timeout does (ABANDONED: no CMoon.battleLosses increment, no penalty — see that enum value's
// own schema comment), just triggered by round count instead of elapsed time.
async function resolveAbandoned(battle, roundLog, submittedRound, playerHpRemaining, enemyHpRemaining) {
  return db.cMoonEnemyBattle.update({
    where: { id: battle.id },
    data: {
      status: 'RESOLVED', outcome: 'ABANDONED', roundNumber: submittedRound + 1,
      playerHpRemaining, enemyHpRemaining,
      roundLog, endedAt: new Date(), activeUserId: null,
    },
    include: { enemyMember: { include: { faction: { include: { appearEffect: true } } } } },
  })
}
