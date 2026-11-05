import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateBattleUpgradeBody, canPurchaseBattleUpgrade, sumBattleUpgradeStatTotals,
  HP_AMOUNT_MIN, HP_AMOUNT_MAX, STAMINA_AMOUNT_MIN, STAMINA_AMOUNT_MAX, PRICE_MIN, PRICE_MAX,
  PURCHASE_LIMIT_MIN, PURCHASE_LIMIT_MAX,
} from '../server/utils/cmoonBattleUpgradeValidation.js'

function validBody(overrides = {}) {
  return { name: 'Iron Will', description: 'Toughen up.', stat: 'HP', amount: 10, price: 1000, purchaseLimit: 1, ...overrides }
}

test('validateBattleUpgradeBody accepts a well-formed HP upgrade', () => {
  const res = validateBattleUpgradeBody(validBody())
  assert.equal(res.ok, true)
  assert.deepEqual(res.data, { name: 'Iron Will', description: 'Toughen up.', stat: 'HP', amount: 10, price: 1000, purchaseLimit: 1, active: true })
})

test('validateBattleUpgradeBody trims name/description and treats blank description as null', () => {
  const res = validateBattleUpgradeBody(validBody({ name: '  Iron Will  ', description: '   ' }))
  assert.equal(res.ok, true)
  assert.equal(res.data.name, 'Iron Will')
  assert.equal(res.data.description, null)
})

test('validateBattleUpgradeBody rejects a missing/blank name', () => {
  assert.equal(validateBattleUpgradeBody(validBody({ name: '' })).ok, false)
  assert.equal(validateBattleUpgradeBody(validBody({ name: '   ' })).ok, false)
})

test('validateBattleUpgradeBody rejects an unknown stat', () => {
  const res = validateBattleUpgradeBody(validBody({ stat: 'MANA' }))
  assert.equal(res.ok, false)
  assert.match(res.message, /stat must be one of/)
})

test('validateBattleUpgradeBody enforces different amount bounds per stat', () => {
  assert.equal(validateBattleUpgradeBody(validBody({ stat: 'HP', amount: HP_AMOUNT_MAX })).ok, true)
  assert.equal(validateBattleUpgradeBody(validBody({ stat: 'HP', amount: HP_AMOUNT_MAX + 1 })).ok, false)
  assert.equal(validateBattleUpgradeBody(validBody({ stat: 'HP', amount: HP_AMOUNT_MIN - 1 })).ok, false)

  assert.equal(validateBattleUpgradeBody(validBody({ stat: 'STAMINA', amount: STAMINA_AMOUNT_MAX })).ok, true)
  assert.equal(validateBattleUpgradeBody(validBody({ stat: 'STAMINA', amount: STAMINA_AMOUNT_MAX + 1 })).ok, false)
  // An amount that's valid for HP but not for STAMINA must be rejected under STAMINA.
  assert.equal(validateBattleUpgradeBody(validBody({ stat: 'STAMINA', amount: HP_AMOUNT_MAX })).ok, false)
})

test('validateBattleUpgradeBody enforces price bounds, 0 allowed (a free promotional upgrade)', () => {
  assert.equal(validateBattleUpgradeBody(validBody({ price: PRICE_MIN })).ok, true)
  assert.equal(validateBattleUpgradeBody(validBody({ price: PRICE_MAX })).ok, true)
  assert.equal(validateBattleUpgradeBody(validBody({ price: PRICE_MIN - 1 })).ok, false)
  assert.equal(validateBattleUpgradeBody(validBody({ price: PRICE_MAX + 1 })).ok, false)
})

test('validateBattleUpgradeBody enforces purchaseLimit bounds', () => {
  assert.equal(validateBattleUpgradeBody(validBody({ purchaseLimit: PURCHASE_LIMIT_MIN })).ok, true)
  assert.equal(validateBattleUpgradeBody(validBody({ purchaseLimit: PURCHASE_LIMIT_MAX })).ok, true)
  assert.equal(validateBattleUpgradeBody(validBody({ purchaseLimit: 0 })).ok, false)
  assert.equal(validateBattleUpgradeBody(validBody({ purchaseLimit: PURCHASE_LIMIT_MAX + 1 })).ok, false)
})

test('validateBattleUpgradeBody defaults active to true, honors an explicit false', () => {
  assert.equal(validateBattleUpgradeBody(validBody()).data.active, true)
  assert.equal(validateBattleUpgradeBody(validBody({ active: false })).data.active, false)
})

test('canPurchaseBattleUpgrade blocks an inactive upgrade regardless of limit', () => {
  const res = canPurchaseBattleUpgrade({ active: false, purchaseLimit: 5, timesPurchased: 0 })
  assert.equal(res.ok, false)
  assert.equal(res.error, 'INACTIVE')
})

test('canPurchaseBattleUpgrade blocks once timesPurchased reaches the limit', () => {
  assert.equal(canPurchaseBattleUpgrade({ active: true, purchaseLimit: 3, timesPurchased: 2 }).ok, true)
  const atLimit = canPurchaseBattleUpgrade({ active: true, purchaseLimit: 3, timesPurchased: 3 })
  assert.equal(atLimit.ok, false)
  assert.equal(atLimit.error, 'LIMIT_REACHED')
  // Never over-purchased past the limit either.
  assert.equal(canPurchaseBattleUpgrade({ active: true, purchaseLimit: 3, timesPurchased: 4 }).ok, false)
})

test('canPurchaseBattleUpgrade allows a fresh purchase-limit-of-1 upgrade exactly once', () => {
  assert.equal(canPurchaseBattleUpgrade({ active: true, purchaseLimit: 1, timesPurchased: 0 }).ok, true)
  assert.equal(canPurchaseBattleUpgrade({ active: true, purchaseLimit: 1, timesPurchased: 1 }).ok, false)
})

test('sumBattleUpgradeStatTotals separates HP and Stamina and multiplies by timesPurchased', () => {
  const totals = sumBattleUpgradeStatTotals([
    { stat: 'HP', amount: 10, timesPurchased: 2 },
    { stat: 'HP', amount: 5, timesPurchased: 1 },
    { stat: 'STAMINA', amount: 3, timesPurchased: 4 },
  ])
  assert.deepEqual(totals, { hpTotal: 25, staminaTotal: 12 })
})

test('sumBattleUpgradeStatTotals handles an empty/missing purchase list', () => {
  assert.deepEqual(sumBattleUpgradeStatTotals([]), { hpTotal: 0, staminaTotal: 0 })
  assert.deepEqual(sumBattleUpgradeStatTotals(undefined), { hpTotal: 0, staminaTotal: 0 })
})
