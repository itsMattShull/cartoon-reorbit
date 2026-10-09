// server/api/cmoon/battle/[id]/action.post.js
// Resolves ONE round of an in-progress cMoon Enemy Battle. Body: { action, roundNumber }.
// `action` is the ONLY thing ever trusted from the client — the enemy's move is always rolled
// here, server-side, and every HP change is computed from that roll plus the player's action,
// never from anything the client asserts about the outcome. `roundNumber` is a staleness/replay
// guard (see the atomic claim below), not itself trusted for anything else.
//
// `action` may also be SPECIAL_ACTION ('SPECIAL_ATTACK') — "spend this round firing your cMoon's
// special attack instead of attacking/blocking" (see CMoonSpecialAttack's own schema comment).
// That's the only action requiring server-side gating beyond shape (battle.playerSpecialCharged
// must be true, and the battle's own cMoon must actually have one assigned) — everything else
// about how a special attack changes the fight (damage/heal/paralyze/attack-stat mods) is pure
// arithmetic applied directly below, then folded into the SAME round-resolution call every other
// action already goes through (resolveRound), so a special-attack round still produces a normal
// roundEntry/roundLog shape — just one where the player's own action never lands a lane hit.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { assertSameOrigin } from '@/server/utils/requireAdmin'
import { grantRewardInTx, enqueueCtoonJobs, processAchievementsForUser } from '@/server/utils/achievements'
import { recomputeCMoonPointsForUsers } from '@/server/cron/cmoon-points-aggregate'
import {
  isValidPlayerSubmittedAction, resolveRound, rollEnemyRewards, buildGrantableReward,
  serializeBattleForClient, MAX_ROUNDS_SAFETY, HEAL_ON_SUCCESSFUL_BLOCK,
  SPECIAL_ACTION, HIT_STREAK_THRESHOLD,
} from '@/server/utils/cmoonEnemyBattle'

const BATTLE_INCLUDE = {
  enemyMember: { include: { faction: { include: { appearEffect: true, specialAttack: true } } } },
  cMoon: { include: { specialAttack: true } },
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const battleId = event.context.params?.id
  if (!battleId) throw createError({ statusCode: 400, statusMessage: 'Missing battle id' })

  const body = await readBody(event)
  const playerAction = body?.action
  const submittedRound = Number(body?.roundNumber)
  if (!isValidPlayerSubmittedAction(playerAction)) throw createError({ statusCode: 400, statusMessage: 'Invalid action' })
  if (!Number.isInteger(submittedRound) || submittedRound < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid roundNumber' })
  }
  const isSpecial = playerAction === SPECIAL_ACTION

  const battle = await db.cMoonEnemyBattle.findUnique({ where: { id: battleId }, include: BATTLE_INCLUDE })
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

  if (isSpecial && !battle.playerSpecialCharged) {
    throw createError({ statusCode: 409, statusMessage: 'Your special attack is not charged yet' })
  }
  const playerSpecialAttack = battle.cMoon?.specialAttack || null
  if (isSpecial && !playerSpecialAttack) {
    throw createError({ statusCode: 409, statusMessage: 'Your cMoon has no special attack assigned' })
  }
  // A paralyzed player can't act at all this round — including firing an already-charged
  // special (see resolveRound's own PARALYZED_ACTION override for the normal 4 moves; this is
  // the equivalent guard for the 5th, since the special's effect applies BEFORE that override
  // would otherwise catch it). The charge itself is untouched — the player tried and failed to
  // act, not chose not to, so it's still there to fire the moment paralysis wears off.
  if (isSpecial && battle.playerParalyzedTurns > 0) {
    throw createError({ statusCode: 409, statusMessage: `You're paralyzed and can't act for ${battle.playerParalyzedTurns} more round(s)` })
  }

  const isSharedPool = battle.enemyMember.battleMode === 'SHARED_POOL'

  // ── Local working copies of every per-round-mutable field — applied to the DB once, at the
  // bottom, in a single update (or folded into resolveWin/resolveLoss/resolveAbandoned on a
  // terminal round). `enemyHp` is read fresh for SHARED_POOL (another player may have landed a
  // hit since this player's last round) rather than trusted from the battle's own snapshot.
  let playerHp = battle.playerHpRemaining
  let playerAtkBonus = battle.playerAtkBonus
  let enemyAtkBonus = battle.enemyAtkBonus
  let playerParalyzedTurns = battle.playerParalyzedTurns
  let enemyParalyzedTurns = battle.enemyParalyzedTurns
  let playerHitStreak = battle.playerHitStreak
  let playerSpecialCharged = battle.playerSpecialCharged
  let enemyHitStreak = battle.enemyHitStreak
  const specialEvents = []

  let enemyHp = isSharedPool
    ? (await db.cMoonEnemyMember.findUnique({ where: { id: battle.enemyMemberId }, select: { currentHp: true } })).currentHp
    : battle.enemyHpRemaining

  // Flat damage against the enemy, honoring SHARED_POOL's atomic concurrency rules — same
  // GREATEST-clamped conditional UPDATE a normal landed hit already used, reused here so a
  // special attack's guaranteed damage can never race another player's hit into a negative pool.
  async function damageEnemy(amount) {
    if (amount <= 0 || enemyHp <= 0) return
    if (!isSharedPool) { enemyHp = Math.max(0, enemyHp - amount); return }
    const rows = await db.$queryRaw`
      UPDATE "CMoonEnemyMember" SET "currentHp" = GREATEST("currentHp" - ${amount}, 0)
      WHERE id = ${battle.enemyMemberId} AND "currentHp" > 0
      RETURNING "currentHp"
    `
    enemyHp = rows.length ? rows[0].currentHp : 0
    if (enemyHp <= 0) await db.cMoonEnemyMember.update({ where: { id: battle.enemyMemberId }, data: { defeatedAt: new Date() } })
  }
  async function healEnemy(amount) {
    if (amount <= 0 || enemyHp <= 0) return // never revives an already-defeated shared pool
    if (!isSharedPool) { enemyHp = Math.min(battle.enemyMember.maxHp, enemyHp + amount); return }
    const rows = await db.$queryRaw`
      UPDATE "CMoonEnemyMember" SET "currentHp" = LEAST("currentHp" + ${amount}, "maxHp")
      WHERE id = ${battle.enemyMemberId} AND "currentHp" > 0
      RETURNING "currentHp"
    `
    enemyHp = rows.length ? rows[0].currentHp : enemyHp
  }

  // ── 1. The player's own special attack, if they chose to fire it this round — resolved BEFORE
  // this round's lane exchange below, so e.g. a freshly-cast PARALYZE_OPPONENT also neutralizes
  // the enemy's action in this very round, not just future ones. ─────────────────────────────
  if (isSpecial) {
    playerHitStreak = 0
    playerSpecialCharged = false
    specialEvents.push({
      side: 'PLAYER', name: playerSpecialAttack.name,
      effectType: playerSpecialAttack.effectType, amount: playerSpecialAttack.amount,
      soundPath: playerSpecialAttack.soundPath || null,
    })
    if (playerSpecialAttack.effectType === 'DAMAGE_OPPONENT') await damageEnemy(playerSpecialAttack.amount)
    else if (playerSpecialAttack.effectType === 'HEAL_SELF') playerHp = Math.min(battle.playerMaxHp, playerHp + playerSpecialAttack.amount)
    else if (playerSpecialAttack.effectType === 'PARALYZE_OPPONENT') enemyParalyzedTurns += playerSpecialAttack.amount
    else if (playerSpecialAttack.effectType === 'LOWER_OPPONENT_ATTACK') enemyAtkBonus -= playerSpecialAttack.amount
    else if (playerSpecialAttack.effectType === 'RAISE_ALLY_ATTACK') playerAtkBonus += playerSpecialAttack.amount
  }

  // ── 2. This round's lane exchange — unchanged mechanics, now paralysis/attack-bonus aware.
  // When isSpecial, playerAction here is SPECIAL_ACTION itself: resolveRound's own isAttack/
  // isBlock treat that as "neither attacks nor blocks", so this call can never ALSO score a lane
  // hit for the player on a special-attack round (no double-counting against totalEnemyDamage
  // below), while the enemy still rolls (and lands, if not paralyzed) normally. ───────────────
  const {
    roundEntry: roundCore, newPlayerHp, enemyHit, enemyBlocked, enemyDamage,
    newPlayerParalyzedTurns, newEnemyParalyzedTurns,
  } = resolveRound({
    playerAction, enemyMember: battle.enemyMember, playerHpRemaining: playerHp, playerMaxHp: battle.playerMaxHp,
    playerAtkBonus, enemyAtkBonus, playerParalyzedTurns, enemyParalyzedTurns,
  })
  playerHp = newPlayerHp
  playerParalyzedTurns = newPlayerParalyzedTurns
  enemyParalyzedTurns = newEnemyParalyzedTurns

  if (enemyHit) await damageEnemy(enemyDamage)
  else if (enemyBlocked) await healEnemy(HEAL_ON_SUCCESSFUL_BLOCK)

  // ── 3. Hit-streak bookkeeping, both sides — see CMoonEnemyBattle.playerHitStreak/
  // enemyHitStreak's own schema comment for the reset/latch rules. ───────────────────────────
  if (!isSpecial) {
    playerHitStreak = roundCore.enemyHit ? playerHitStreak + 1 : 0
    if (playerHitStreak >= HIT_STREAK_THRESHOLD) playerSpecialCharged = true
  }
  enemyHitStreak = roundCore.playerHit ? enemyHitStreak + 1 : 0

  // ── 4. The NPC has no choice to make — the instant ITS OWN streak caps out, its faction's
  // special (if any) fires automatically as a bonus on top of whatever this round already did.
  const enemySpecialAttack = battle.enemyMember.faction?.specialAttack || null
  if (enemyHitStreak >= HIT_STREAK_THRESHOLD && enemySpecialAttack) {
    enemyHitStreak = 0
    specialEvents.push({
      side: 'ENEMY', name: enemySpecialAttack.name,
      effectType: enemySpecialAttack.effectType, amount: enemySpecialAttack.amount,
      soundPath: enemySpecialAttack.soundPath || null,
    })
    if (enemySpecialAttack.effectType === 'DAMAGE_OPPONENT') playerHp = Math.max(0, playerHp - enemySpecialAttack.amount)
    else if (enemySpecialAttack.effectType === 'HEAL_SELF') await healEnemy(enemySpecialAttack.amount)
    else if (enemySpecialAttack.effectType === 'PARALYZE_OPPONENT') playerParalyzedTurns += enemySpecialAttack.amount
    else if (enemySpecialAttack.effectType === 'LOWER_OPPONENT_ATTACK') playerAtkBonus -= enemySpecialAttack.amount
    else if (enemySpecialAttack.effectType === 'RAISE_ALLY_ATTACK') enemyAtkBonus += enemySpecialAttack.amount
  }

  const newEnemyHp = enemyHp
  const roundEntry = {
    round: submittedRound, ...roundCore,
    ...(specialEvents.length ? { specials: specialEvents } : {}),
  }
  const roundLog = [...(Array.isArray(battle.roundLog) ? battle.roundLog : []), roundEntry]
  const statMods = { playerAtkBonus, enemyAtkBonus, playerParalyzedTurns, enemyParalyzedTurns, playerHitStreak, playerSpecialCharged, enemyHitStreak }

  // WIN takes priority over a same-round mutual KO (both sides would have hit 0 hp this round)
  // — the player still gets credit for the kill rather than being denied a reward on a technicality.
  if (newEnemyHp <= 0) {
    const result = await resolveWin(battle, roundLog, submittedRound, playerHp)
    return { round: roundEntry, battle: serializeBattleForClient(result) }
  }
  if (playerHp <= 0) {
    const result = await resolveLoss(battle, roundLog, submittedRound, newEnemyHp)
    return { round: roundEntry, battle: serializeBattleForClient(result) }
  }
  // Neither side reached 0 this round — under a pathological RNG streak (see this constant's own
  // comment) a battle could otherwise run indefinitely, one round per request, so cap it here the
  // same way an idle timeout does: no penalty, just ended.
  if (submittedRound + 1 >= MAX_ROUNDS_SAFETY) {
    const result = await resolveAbandoned(battle, roundLog, submittedRound, playerHp, newEnemyHp)
    return { round: roundEntry, battle: serializeBattleForClient(result) }
  }

  const updated = await db.cMoonEnemyBattle.update({
    where: { id: battleId },
    data: {
      roundNumber: submittedRound + 1, playerHpRemaining: playerHp, enemyHpRemaining: newEnemyHp, roundLog,
      ...statMods,
    },
    include: BATTLE_INCLUDE,
  })
  return { round: roundEntry, battle: serializeBattleForClient(updated) }
})

async function resolveWin(battle, roundLog, submittedRound, playerHpRemaining) {
  const rewardRows = await db.cMoonEnemyReward.findMany({
    where: { enemyMemberId: battle.enemyMemberId },
    include: { ctoon: { select: { quantity: true, name: true } } },
  })
  const hitRewards = rollEnemyRewards(rewardRows)
  const grantable = buildGrantableReward(hitRewards)
  // A player with no cMoon (battle.cMoonId is null — see that column's own schema comment) never
  // earns cMoon points: there's no team to credit, and crediting one anyway would misattribute a
  // non-member's win. Every other reward type and achievement progress below still applies.
  const pointsAwarded = battle.cMoonId ? Math.max(0, Number(battle.enemyMember.cMoonPointsReward) || 0) : 0

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

    // No cMoon to credit a win to for a null-cMoonId battle — see pointsAwarded's own comment.
    if (battle.cMoonId) {
      await tx.cMoon.update({ where: { id: battle.cMoonId }, data: { battleWins: { increment: 1 } } })
    }

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
        playerHpRemaining, enemyHpRemaining: 0,
        roundLog, pointsAwarded, rewardsGranted, endedAt: new Date(), activeUserId: null,
      },
      include: { enemyMember: { include: { faction: { include: { appearEffect: true, specialAttack: true } } } }, cMoon: { include: { specialAttack: true } } },
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

async function resolveLoss(battle, roundLog, submittedRound, enemyHpRemaining) {
  return db.$transaction(async (tx) => {
    // No cMoon to credit a loss to for a null-cMoonId battle — see resolveWin's pointsAwarded comment.
    if (battle.cMoonId) {
      await tx.cMoon.update({ where: { id: battle.cMoonId }, data: { battleLosses: { increment: 1 } } })
    }
    return tx.cMoonEnemyBattle.update({
      where: { id: battle.id },
      data: {
        status: 'RESOLVED', outcome: 'LOSS', roundNumber: submittedRound + 1,
        playerHpRemaining: 0, enemyHpRemaining,
        roundLog, endedAt: new Date(), activeUserId: null,
      },
      include: { enemyMember: { include: { faction: { include: { appearEffect: true, specialAttack: true } } } }, cMoon: { include: { specialAttack: true } } },
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
    include: { enemyMember: { include: { faction: { include: { appearEffect: true, specialAttack: true } } } }, cMoon: { include: { specialAttack: true } } },
  })
}
