// server/api/admin/cmoon-enemy-members/[id]/preview-action.post.js
// Resolves ONE round of an admin "preview encounter" (see preview.post.js). Unlike the real
// server/api/cmoon/battle/[id]/action.post.js, there is no CMoonEnemyBattle row to hold state
// between requests — the client echoes back its current { playerHpRemaining, enemyHpRemaining,
// roundNumber } on every call, and this endpoint returns the next one. Nothing is ever persisted
// (no battle log, no rewards granted, no cMoon points, no stats, no achievement progress) — this
// is admin-only and consequence-free by design, so trusting the client to echo its own preview
// state back accurately is an acceptable trade: an admin "cheating" their own test harms no one.
//
// Shares the exact same round math as the real endpoint via resolveRound() (see that function's
// own comment in cmoonEnemyBattle.js) — always treated as a solo, non-shared-pool fight
// regardless of the real member's configured battleMode, since a preview has no other players to
// coordinate a shared pool with.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import {
  isValidBattleAction, resolveRound, rollEnemyRewards, HEAL_ON_SUCCESSFUL_BLOCK, MAX_ROUNDS_SAFETY,
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
  if (
    !Number.isInteger(playerHpRemaining) || !Number.isInteger(enemyHpRemaining) ||
    !Number.isInteger(roundNumber) || roundNumber < 1
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid preview state' })
  }

  // Read fresh every round (never cached from preview.post.js's start call) — an admin actively
  // tweaking maxHp/crit chances/sounds while previewing should see the change reflected on the
  // very next click, not whatever was configured when the preview began.
  const member = await db.cMoonEnemyMember.findUnique({ where: { id } })
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Enemy member not found' })

  const { roundEntry, newPlayerHp, enemyDamage, enemyHit, enemyBlocked } = resolveRound({
    playerAction, enemyMember: member, playerHpRemaining,
  })
  let newEnemyHp = enemyHpRemaining
  if (enemyHit) newEnemyHp = Math.max(0, newEnemyHp - enemyDamage)
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
    state: { playerHpRemaining: newPlayerHp, enemyHpRemaining: newEnemyHp, roundNumber: nextRoundNumber },
    outcome,
    wouldGrant,
  }
})
