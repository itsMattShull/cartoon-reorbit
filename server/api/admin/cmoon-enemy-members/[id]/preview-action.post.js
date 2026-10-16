// server/api/admin/cmoon-enemy-members/[id]/preview-action.post.js
// Resolves ONE round of an admin "preview encounter" (see preview.post.js). Unlike the real
// server/api/cmoon/battle/[id]/action.post.js, there is no CMoonEnemyBattle row to hold state
// between requests — the client echoes back its current { playerHpRemaining, enemyHpRemaining,
// playerStamina, roundNumber } on every call, and this endpoint returns the next one. Nothing is
// ever persisted (no battle log, no rewards granted, no cMoon points, no stats, no achievement
// progress) — this is admin-only and consequence-free by design, so trusting the client to echo
// its own preview state back accurately is an acceptable trade: an admin "cheating" their own
// test harms no one.
//
// Shares the exact same round math as the real endpoint via resolveRound() (see that function's
// own comment in cmoonEnemyBattle.js) — always treated as a solo, non-shared-pool fight
// regardless of the real member's configured battleMode, since a preview has no other players to
// coordinate a shared pool with. This includes the stamina/block-counter mechanic — paralysis and
// the player's own special attack are deliberately NOT modeled here (the latter needs a real
// cMoon's assigned special, which an admin preview has none of), but stamina is a pure function of
// this member's own config plus the echoed-back pool, so there's no reason for it to be the one
// mechanic this preview still can't show.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { getGlobalConfig } from '@/server/utils/cmoon'
import {
  isValidBattleAction, resolveRound, rollEnemyRewards, HEAL_ON_SUCCESSFUL_BLOCK, MAX_ROUNDS_SAFETY, isAttack,
} from '@/server/utils/cmoonEnemyBattle'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const body = await readBody(event)
  const playerAction = body?.action
  if (!isValidBattleAction(playerAction)) throw createError({ statusCode: 400, statusMessage: 'Invalid action' })

  const playerHpRemaining = Number(body?.playerHpRemaining)
  const enemyHpRemaining = Number(body?.enemyHpRemaining)
  const roundNumber = Number(body?.roundNumber)
  // Echoed back every round same as the other state fields — snapshotted once at preview.post.js's
  // start call rather than re-read fresh here, matching how a real battle snapshots
  // CMoonEnemyBattle.playerMaxHp once instead of letting the heal-cap shift mid-fight.
  const playerMaxHp = Number(body?.playerMaxHp)
  // playerStamina/playerMaxStamina follow the exact same echo-back convention — see
  // CMoonEnemyBattle.playerStamina's own schema comment. playerMaxStamina <= 0 (the default for
  // every pre-this-mechanic preview session) is a valid, intentional "mechanic off" state, not an
  // error, so it's only required to be a non-negative integer, never > 0.
  const playerStamina = Number(body?.playerStamina)
  const playerMaxStamina = Number(body?.playerMaxStamina)
  if (
    !Number.isInteger(playerHpRemaining) || !Number.isInteger(enemyHpRemaining) ||
    !Number.isInteger(roundNumber) || roundNumber < 1 ||
    !Number.isInteger(playerMaxHp) || playerMaxHp < 1 ||
    !Number.isInteger(playerStamina) || playerStamina < 0 ||
    !Number.isInteger(playerMaxStamina) || playerMaxStamina < 0
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid preview state' })
  }

  // Read fresh every round (never cached from preview.post.js's start call) — an admin actively
  // tweaking maxHp/crit chances/sounds while previewing should see the change reflected on the
  // very next click, not whatever was configured when the preview began.
  const member = await db.cMoonEnemyMember.findUnique({ where: { id } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  // Same stamina gate action.post.js enforces server-side — see that endpoint's own comment.
  // Never fires when playerMaxStamina <= 0 (mechanic off for this preview session).
  if (isAttack(playerAction) && playerMaxStamina > 0 && playerStamina <= 0) {
    throw createError({ statusCode: 409, statusMessage: "You're out of stamina — block to recover before attacking again" })
  }
  // Only read when stamina is actually active, same "don't query for nothing" discipline
  // action.post.js's own read already follows.
  const blockCounterDamage = playerMaxStamina > 0
    ? Math.max(0, Number((await getGlobalConfig())?.cMoonEnemyBattleBlockCounterDamage) || 0)
    : 0

  const { roundEntry, newPlayerHp, enemyDamage, enemyBlocked, newPlayerStamina } = resolveRound({
    playerAction, enemyMember: member, playerHpRemaining, playerMaxHp,
    playerStamina, playerMaxStamina, blockCounterDamage,
  })
  let newEnemyHp = enemyHpRemaining
  // enemyDamage > 0 (not the narrower enemyHit) also covers a block's counter-hit — see
  // resolveRound's own comment and action.post.js's identical check for why gating on enemyHit
  // alone would silently drop every counter-hit here.
  if (enemyDamage > 0) newEnemyHp = Math.max(0, newEnemyHp - enemyDamage)
  else if (enemyBlocked) newEnemyHp = Math.min(member.maxHp, newEnemyHp + HEAL_ON_SUCCESSFUL_BLOCK)

  const nextRoundNumber = roundNumber + 1
  let outcome = null
  let wouldGrant = null

  if (newEnemyHp <= 0) {
    outcome = 'WIN'
    // Read-only preview of what a REAL win would roll — never granted, just displayed, so an
    // admin can confirm the reward table is configured the way they intended.
    const rewardRows = await db.cMoonEnemyReward.findMany({
      where: { enemyMemberId: id },
      include: {
        ctoon: { select: { name: true } },
        avatar: { select: { label: true } },
        background: { select: { label: true } },
      },
    })
    const hitRewards = rollEnemyRewards(rewardRows)
    wouldGrant = {
      cMoonPoints: member.cMoonPointsReward,
      items: hitRewards.map(r => {
        if (r.rewardType === 'CTOON') return { type: 'CTOON', label: r.ctoon?.name || 'cToon', quantity: r.quantity }
        if (r.rewardType === 'AVATAR') return { type: 'AVATAR', label: r.avatar?.label || 'Avatar' }
        if (r.rewardType === 'BACKGROUND') return { type: 'BACKGROUND', label: r.background?.label || 'Background' }
        if (r.rewardType === 'POINTS') return { type: 'POINTS', quantity: r.quantity }
        return null
      }).filter(Boolean),
    }
  } else if (newPlayerHp <= 0) {
    outcome = 'LOSS'
  } else if (nextRoundNumber >= MAX_ROUNDS_SAFETY) {
    outcome = 'ABANDONED'
  }

  return {
    round: roundEntry,
    state: {
      playerHpRemaining: newPlayerHp, playerMaxHp, enemyHpRemaining: newEnemyHp,
      playerStamina: newPlayerStamina, playerMaxStamina, roundNumber: nextRoundNumber,
    },
    outcome,
    wouldGrant,
  }
})
