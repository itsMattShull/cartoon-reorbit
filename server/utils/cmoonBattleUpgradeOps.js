// server/utils/cmoonBattleUpgradeOps.js
// Prisma-touching operations for the player-facing cMart "Upgrades" purchase flow
// (server/api/cmart/battle-upgrades.get.js, server/api/cmart/battle-upgrades/[id]/buy.post.js).
// Pure bounds/limit checks live in the import-free cmoonBattleUpgradeValidation.js — see that
// file's own comment on why this one (which pulls in server/prisma.js) can't be unit-tested the
// same way.
import { prisma } from '../prisma.js'
import { canPurchaseBattleUpgrade } from './cmoonBattleUpgradeValidation.js'

export class CMoonBattleUpgradePurchaseError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

// Every active upgrade, plus the CALLER's own timesPurchased for each (0 if never bought) — the
// cMart card needs both to render "Buy" vs. "Maxed out (N/N)".
export async function listBattleUpgradesForUser(userId) {
  const [upgrades, purchases] = await Promise.all([
    prisma.cMoonBattleUpgrade.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    userId
      ? prisma.userCMoonBattleUpgrade.findMany({ where: { userId }, select: { upgradeId: true, timesPurchased: true } })
      : Promise.resolve([]),
  ])
  const purchasedByUpgrade = new Map(purchases.map(p => [p.upgradeId, p.timesPurchased]))
  return upgrades.map(u => ({
    id: u.id,
    name: u.name,
    description: u.description,
    stat: u.stat,
    amount: u.amount,
    price: u.price,
    purchaseLimit: u.purchaseLimit,
    timesPurchased: purchasedByUpgrade.get(u.id) || 0,
  }))
}

// One purchase of one upgrade for one player: validates the upgrade is still active and the
// player hasn't already hit its purchaseLimit, checks available points (gross minus active
// locks — same convention as server/api/cmart/czones/buy.post.js), then in one transaction
// deducts the cost, logs it, grants the stat (incrementing the SAME User.cMoonHpAdjustment/
// cMoonStaminaAdjustment field the "Manage User HP & Stamina" admin tool uses — see
// combinePlayerMaxHp/combinePlayerMaxStamina's own comment on why this is additive), and
// upserts this player's UserCMoonBattleUpgrade row.
export async function purchaseBattleUpgrade(userId, upgradeId) {
  const [upgrade, existingPurchase, userPts, activeLocks] = await Promise.all([
    prisma.cMoonBattleUpgrade.findUnique({ where: { id: upgradeId } }),
    prisma.userCMoonBattleUpgrade.findUnique({ where: { userId_upgradeId: { userId, upgradeId } } }),
    prisma.userPoints.findUnique({ where: { userId }, select: { points: true } }),
    prisma.lockedPoints.findMany({ where: { userId, status: 'ACTIVE' }, select: { amount: true } }),
  ])
  if (!upgrade) throw new CMoonBattleUpgradePurchaseError('NOT_FOUND', 'Upgrade not found')

  const timesPurchased = existingPurchase?.timesPurchased || 0
  const eligibility = canPurchaseBattleUpgrade({ active: upgrade.active, purchaseLimit: upgrade.purchaseLimit, timesPurchased })
  if (!eligibility.ok) {
    throw new CMoonBattleUpgradePurchaseError(
      eligibility.error,
      eligibility.error === 'LIMIT_REACHED'
        ? `You've already purchased ${upgrade.name} the maximum ${upgrade.purchaseLimit} time${upgrade.purchaseLimit === 1 ? '' : 's'}`
        : 'This upgrade is no longer available'
    )
  }

  const totalPoints = userPts?.points || 0
  const lockedSum = activeLocks.reduce((acc, l) => acc + (l.amount || 0), 0)
  const available = totalPoints - lockedSum
  if (available < upgrade.price) {
    throw new CMoonBattleUpgradePurchaseError('NOT_ENOUGH_POINTS', 'Not enough available points')
  }

  const statField = upgrade.stat === 'STAMINA' ? 'cMoonStaminaAdjustment' : 'cMoonHpAdjustment'

  const result = await prisma.$transaction(async tx => {
    const updatedPoints = await tx.userPoints.update({
      where: { userId },
      data: { points: { decrement: upgrade.price } },
    })

    await tx.pointsLog.create({
      data: {
        userId,
        points: upgrade.price,
        total: updatedPoints.points,
        method: `Bought cMoon Battle Upgrade: ${upgrade.name}`,
        direction: 'decrease',
      },
    })

    // Atomic insert-or-conditionally-increment: the pre-transaction eligibility check above read
    // timesPurchased OUTSIDE this transaction, so two concurrent purchases of the same upgrade
    // (a double-click, two tabs) could both pass that check at limit-1 and each try to increment
    // — plain upsert-with-increment has no way to express "but not past the limit" and would let
    // both through, one over. The WHERE on the UPDATE side re-checks the limit at the instant of
    // the actual write: if a concurrent purchase already pushed timesPurchased to the limit, this
    // row is left untouched and RETURNING yields nothing, which the empty-check below turns back
    // into the same LIMIT_REACHED error the pre-check already gives the common (non-racing) case
    // — rolling back the points/HP writes above via this transaction, not just this one statement.
    const purchaseRows = await tx.$queryRaw`
      INSERT INTO "UserCMoonBattleUpgrade" (id, "userId", "upgradeId", "timesPurchased", "updatedAt")
      VALUES (gen_random_uuid()::text, ${userId}, ${upgradeId}, 1, now())
      ON CONFLICT ("userId", "upgradeId") DO UPDATE
        SET "timesPurchased" = "UserCMoonBattleUpgrade"."timesPurchased" + 1, "updatedAt" = now()
        WHERE "UserCMoonBattleUpgrade"."timesPurchased" < ${upgrade.purchaseLimit}
      RETURNING "timesPurchased"
    `
    if (!purchaseRows.length) {
      throw new CMoonBattleUpgradePurchaseError('LIMIT_REACHED', `You've already purchased ${upgrade.name} the maximum ${upgrade.purchaseLimit} time${upgrade.purchaseLimit === 1 ? '' : 's'}`)
    }

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { [statField]: { increment: upgrade.amount } },
      select: { cMoonHpAdjustment: true, cMoonStaminaAdjustment: true },
    })

    return { updatedUser, timesPurchased: purchaseRows[0].timesPurchased }
  })

  return {
    id: upgrade.id,
    name: upgrade.name,
    stat: upgrade.stat,
    amount: upgrade.amount,
    price: upgrade.price,
    timesPurchased: result.timesPurchased,
    purchaseLimit: upgrade.purchaseLimit,
    newAdjustment: upgrade.stat === 'STAMINA' ? result.updatedUser.cMoonStaminaAdjustment : result.updatedUser.cMoonHpAdjustment,
  }
}
