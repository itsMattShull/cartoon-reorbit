// server/api/cmoon/[id]/contribute.post.js
// "Contribute to cMoon" — spend points to build permanent, personal affinity with the caller's
// CURRENT cMoon. Mirrors the cMart spend pattern (server/api/cmart/czones/buy.post.js): points
// are deducted via a $transaction + PointsLog row. Crossing an admin-configured
// CMoonAffinityLevel threshold grants that level's reward(s) via the shared grantRewardInTx path.
//
// Security notes (see adversarial review this feature went through):
// - The balance check and decrement happen INSIDE the transaction, under a row lock
//   (`SELECT ... FOR UPDATE`), not as a pre-check — closes the double-spend race a pre-check
//   snapshot would leave open under concurrent requests.
// - Membership (must currently belong to this cMoon to contribute) is re-checked from the
//   database inside the same locked transaction, never trusted from client input.
// - Level-threshold recompute + reward grant happen in the same transaction as the decrement,
//   so a crossed threshold can never be observed without the points actually being spent, and
//   grants are idempotent (upsert/skipDuplicates) against a retried or racing request.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'
import { grantRewardInTx } from '@/server/utils/achievements'
import { assertSameOrigin } from '@/server/utils/requireAdmin'

// Comfortably above any real single contribution, well under Int32 range — just a backstop
// against pathological/overflow input, not a meaningful gameplay cap (levels are admin-defined).
const MAX_CONTRIBUTE_AMOUNT = 5_000_000

class ContributeError extends Error {
  constructor(code, statusMessage) {
    super(code)
    this.code = code
    this.statusMessage = statusMessage
  }
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)

  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const cMoonId = event.context.params?.id
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) throw createError({ statusCode: 403, statusMessage: 'cMoons are not enabled' })

  const body = await readBody(event)
  const amount = Number(body?.amount)
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_CONTRIBUTE_AMOUNT) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount' })
  }

  const cmoon = await db.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  let result
  try {
    result = await db.$transaction(async (tx) => {
      // Lock the member row and re-check current membership — never trust a cached client value.
      const [userRow] = await tx.$queryRaw`SELECT "cMoonId" FROM "User" WHERE id = ${userId} FOR UPDATE`
      if (!userRow || userRow.cMoonId !== cMoonId) {
        throw new ContributeError('NOT_A_MEMBER', 'You must be a member of this cMoon to contribute')
      }

      // Lock the points row, then check available balance (gross minus active locks) before
      // decrementing — all inside this same lock window, closing the check-then-act race.
      const [ptsRow] = await tx.$queryRaw`SELECT points FROM "UserPoints" WHERE "userId" = ${userId} FOR UPDATE`
      const currentPoints = ptsRow?.points || 0
      const activeLocks = await tx.lockedPoints.findMany({ where: { userId, status: 'ACTIVE' }, select: { amount: true } })
      const lockedSum = activeLocks.reduce((acc, l) => acc + (l.amount || 0), 0)
      const available = currentPoints - lockedSum
      if (available < amount) {
        throw new ContributeError('INSUFFICIENT_POINTS', 'Not enough available points')
      }

      const updatedPts = await tx.userPoints.update({ where: { userId }, data: { points: { decrement: amount } } })
      await tx.pointsLog.create({
        data: { userId, points: amount, total: updatedPts.points, method: `cMoon Affinity: ${cmoon.name}`, direction: 'decrease' }
      })

      const affinity = await tx.cMoonAffinity.upsert({
        where: { userId_cMoonId: { userId, cMoonId } },
        create: { userId, cMoonId, affinitySpent: amount },
        update: { affinitySpent: { increment: amount } }
      })

      const newLevel = await tx.cMoonAffinityLevel.findFirst({
        where: { cMoonId, threshold: { lte: affinity.affinitySpent } },
        orderBy: { threshold: 'desc' }
      })

      let leveledUpTo = null
      if (newLevel && newLevel.id !== affinity.currentLevelId) {
        // Only ever move forward, even if the ladder shrank (an admin deleted a higher level
        // the member had already reached) — never let a level-up silently move a member down.
        const prevLevel = affinity.currentLevelId
          ? await tx.cMoonAffinityLevel.findUnique({ where: { id: affinity.currentLevelId }, select: { threshold: true } })
          : null
        if (!prevLevel || newLevel.threshold > prevLevel.threshold) {
          await tx.cMoonAffinity.update({
            where: { userId_cMoonId: { userId, cMoonId } },
            data: { currentLevelId: newLevel.id }
          })

          const reward = { backgrounds: [], avatars: [], glowCMoonId: newLevel.grantsGlow ? cMoonId : null }
          if (newLevel.rewardBackgroundId) reward.backgrounds.push({ backgroundId: newLevel.rewardBackgroundId })
          if (newLevel.rewardAvatarId) reward.avatars.push({ avatarId: newLevel.rewardAvatarId })
          await grantRewardInTx(tx, userId, reward, `cmoonAffinity:level:${newLevel.id}`)

          // Auto-equip the member's first-ever glow so it's visible without an extra step;
          // later glows from other cMoons stay unequipped until explicitly chosen.
          if (newLevel.grantsGlow) {
            await tx.user.updateMany({ where: { id: userId, equippedGlowCMoonId: null }, data: { equippedGlowCMoonId: cMoonId } })
          }

          leveledUpTo = { id: newLevel.id, name: newLevel.name, grantsGlow: newLevel.grantsGlow }
        }
      }

      return { affinitySpent: affinity.affinitySpent, leveledUpTo }
    })
  } catch (err) {
    if (err instanceof ContributeError) {
      const statusCode = err.code === 'NOT_A_MEMBER' ? 403 : 400
      throw createError({ statusCode, statusMessage: err.statusMessage })
    }
    throw err
  }

  return { success: true, affinitySpent: result.affinitySpent, leveledUpTo: result.leveledUpTo }
})
