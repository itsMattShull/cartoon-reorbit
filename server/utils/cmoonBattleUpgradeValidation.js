// server/utils/cmoonBattleUpgradeValidation.js
// Pure (no Prisma/achievements import) validation for the admin "Manage Upgrades" tool
// (server/api/admin/cmoon-battle-upgrades*) and the pure purchase-limit check shared by the
// player-facing buy endpoint — kept import-free so it stays unit-testable, same split as
// cmoonHpAdjustmentValidation.js vs cmoonHpAdjustmentOps.js.

export const STATS = ['HP', 'STAMINA']

export const NAME_MAX_LENGTH = 80
export const DESCRIPTION_MAX_LENGTH = 500
// HP amounts share the same ceiling as a single admin HP adjustment (MAX_HP_MAX in
// cmoonEnemy.js) would be excessive for one cMart purchase — capped far lower so one upgrade can
// never single-handedly dwarf a player's whole natural HP. Stamina has no rank-bonus concept at
// all (see combinePlayerMaxStamina's own comment), so its ceiling mirrors the existing admin
// stamina tool's own 0-50 effective-stamina range.
export const HP_AMOUNT_MIN = 1
export const HP_AMOUNT_MAX = 1000
export const STAMINA_AMOUNT_MIN = 1
export const STAMINA_AMOUNT_MAX = 50
export const PRICE_MIN = 0
export const PRICE_MAX = 100_000_000
export const PURCHASE_LIMIT_MIN = 1
export const PURCHASE_LIMIT_MAX = 100

function amountBoundsFor(stat) {
  return stat === 'STAMINA'
    ? { min: STAMINA_AMOUNT_MIN, max: STAMINA_AMOUNT_MAX }
    : { min: HP_AMOUNT_MIN, max: HP_AMOUNT_MAX }
}

// Admin create/edit body for one CMoonBattleUpgrade row. `existing` (the current DB row, when
// editing) is accepted but unused today — kept for parity with parseSpecialAttackBody's own
// signature in case a future field needs an existing-value fallback.
export function validateBattleUpgradeBody(body, existing = null) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return { ok: false, message: 'Name is required' }
  if (name.length > NAME_MAX_LENGTH) return { ok: false, message: `Name must be ${NAME_MAX_LENGTH} characters or fewer` }

  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return { ok: false, message: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer` }
  }

  const stat = body?.stat
  if (!STATS.includes(stat)) return { ok: false, message: `stat must be one of: ${STATS.join(', ')}` }

  const { min: amountMin, max: amountMax } = amountBoundsFor(stat)
  const amount = Number(body?.amount)
  if (!Number.isInteger(amount) || amount < amountMin || amount > amountMax) {
    return { ok: false, message: `amount must be a whole number between ${amountMin} and ${amountMax} for ${stat}` }
  }

  const price = Number(body?.price)
  if (!Number.isInteger(price) || price < PRICE_MIN || price > PRICE_MAX) {
    return { ok: false, message: `price must be a whole number between ${PRICE_MIN} and ${PRICE_MAX}` }
  }

  const purchaseLimit = Number(body?.purchaseLimit)
  if (!Number.isInteger(purchaseLimit) || purchaseLimit < PURCHASE_LIMIT_MIN || purchaseLimit > PURCHASE_LIMIT_MAX) {
    return { ok: false, message: `purchaseLimit must be a whole number between ${PURCHASE_LIMIT_MIN} and ${PURCHASE_LIMIT_MAX}` }
  }

  const active = body?.active !== false // defaults to true, same convention as every other admin catalog toggle in this codebase

  return {
    ok: true,
    data: {
      name,
      description: description || null,
      stat,
      amount,
      price,
      purchaseLimit,
      active,
    },
  }
}

// Pure arithmetic for the prestige reset (prestigeUser in cmoonPrestige.js): given this player's
// purchase rows — each `{ stat, grantedTotal }`, `grantedTotal` being UserCMoonBattleUpgrade's own
// running total of what THIS player's purchases of THIS upgrade actually granted (stamped at each
// purchase from the upgrade's amount at that time — see that column's own schema comment) — sums
// how much HP and Stamina to subtract back out of User.cMoonHpAdjustment/cMoonStaminaAdjustment.
// Never re-derives from the upgrade's CURRENT amount: an admin can edit `amount` after a player
// already owns earlier purchases (see cmoon-battle-upgrades/[id].put.js), and re-deriving would
// then misattribute those purchases' grants to the new value.
export function sumBattleUpgradeStatTotals(purchases) {
  let hpTotal = 0
  let staminaTotal = 0
  for (const p of purchases || []) {
    const total = Number(p.grantedTotal) || 0
    if (p.stat === 'STAMINA') staminaTotal += total
    else hpTotal += total
  }
  return { hpTotal, staminaTotal }
}

// Pure eligibility check for one purchase attempt — the player's current timesPurchased for
// this specific upgrade against its own purchaseLimit. Funds (points vs. price, with locked
// points excluded) are checked separately in cmoonBattleUpgradeOps.js, since that needs a live
// DB read this module deliberately never performs.
export function canPurchaseBattleUpgrade({ active, purchaseLimit, timesPurchased }) {
  if (active === false) return { ok: false, error: 'INACTIVE' }
  const limit = Number(purchaseLimit) || 0
  const purchased = Number(timesPurchased) || 0
  if (purchased >= limit) return { ok: false, error: 'LIMIT_REACHED' }
  return { ok: true }
}
