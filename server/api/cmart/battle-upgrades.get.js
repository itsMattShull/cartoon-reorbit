// server/api/cmart/battle-upgrades.get.js
// Active cMoon battle upgrades (HP/Stamina) available on the cMart's "Upgrades" tab, plus the
// CALLER's own purchase count for each — same "per-caller, never cached" stance
// upgrades-config.get.js's own sibling fields avoid by being site-wide config instead; these are
// genuinely per-player, so no shared cache here. Works for a logged-out viewer too (every
// timesPurchased reads 0, same as a brand-new account), matching the rest of /api/cmart's own
// "browse without an account, need one to buy" UX.
import { defineEventHandler } from 'h3'
import { listBattleUpgradesForUser } from '@/server/utils/cmoonBattleUpgradeOps'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId || null
  const upgrades = await listBattleUpgradesForUser(userId)
  return { upgrades }
})
