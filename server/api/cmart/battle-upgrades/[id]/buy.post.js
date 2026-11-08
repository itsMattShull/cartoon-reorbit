// server/api/cmart/battle-upgrades/[id]/buy.post.js
// Purchase one cMoon battle HP/Stamina upgrade with points — see purchaseBattleUpgrade's own
// comment in cmoonBattleUpgradeOps.js for the full transaction. Mirrors
// server/api/cmart/czones/buy.post.js's own shape (the existing "Upgrades" tab purchase flow).
import { defineEventHandler, createError } from 'h3'
import { purchaseBattleUpgrade, CMoonBattleUpgradePurchaseError } from '@/server/utils/cmoonBattleUpgradeOps'

const ERROR_STATUS = {
  NOT_FOUND: 404,
  INACTIVE: 400,
  LIMIT_REACHED: 400,
  NOT_ENOUGH_POINTS: 400,
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const upgradeId = event.context.params?.id
  if (!upgradeId) throw createError({ statusCode: 400, statusMessage: 'Missing upgrade id' })

  try {
    const result = await purchaseBattleUpgrade(userId, upgradeId)
    return { success: true, ...result }
  } catch (err) {
    if (err instanceof CMoonBattleUpgradePurchaseError) {
      throw createError({ statusCode: ERROR_STATUS[err.code] || 400, statusMessage: err.message })
    }
    throw err
  }
})
