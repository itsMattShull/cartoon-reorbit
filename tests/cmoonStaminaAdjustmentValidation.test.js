import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STAMINA_TARGET_MIN, STAMINA_TARGET_MAX, STAMINA_DELTA_MIN, STAMINA_DELTA_MAX,
  validateSetUserStaminaBody, validateMassStaminaAdjustBody,
} from '../server/utils/cmoonStaminaAdjustmentValidation.js'

test('bounds mirror cmoon-settings.post.js\'s own starting-stamina validation (0 to 50)', () => {
  assert.equal(STAMINA_TARGET_MIN, 0)
  assert.equal(STAMINA_TARGET_MAX, 50)
  assert.equal(STAMINA_DELTA_MIN, -50)
  assert.equal(STAMINA_DELTA_MAX, 50)
})

test('validateSetUserStaminaBody accepts a valid integer target, including 0', () => {
  const res = validateSetUserStaminaBody({ targetStamina: 5 })
  assert.equal(res.error, undefined)
  assert.equal(res.targetStamina, 5)
  assert.equal(validateSetUserStaminaBody({ targetStamina: 0 }).error, undefined)
})

test('validateSetUserStaminaBody rejects non-integer, out-of-range, and missing values', () => {
  assert.match(validateSetUserStaminaBody({ targetStamina: -1 }).error, /between 0 and 50/)
  assert.match(validateSetUserStaminaBody({ targetStamina: 51 }).error, /between 0 and 50/)
  assert.match(validateSetUserStaminaBody({ targetStamina: 2.5 }).error, /between 0 and 50/)
  assert.match(validateSetUserStaminaBody({}).error, /between 0 and 50/)
  assert.match(validateSetUserStaminaBody({ targetStamina: 'abc' }).error, /between 0 and 50/)
})

test('validateMassStaminaAdjustBody requires a known mode', () => {
  assert.match(validateMassStaminaAdjustBody({ mode: 'nope', value: 5 }).error, /mode must be/)
  assert.match(validateMassStaminaAdjustBody({ value: 5 }).error, /mode must be/)
})

test('validateMassStaminaAdjustBody delta mode accepts a non-zero in-range integer, rejects zero/out-of-range', () => {
  assert.deepEqual(validateMassStaminaAdjustBody({ mode: 'delta', value: 3 }), { mode: 'delta', value: 3 })
  assert.deepEqual(validateMassStaminaAdjustBody({ mode: 'delta', value: -3 }), { mode: 'delta', value: -3 })
  assert.match(validateMassStaminaAdjustBody({ mode: 'delta', value: 0 }).error, /non-zero/)
  assert.match(validateMassStaminaAdjustBody({ mode: 'delta', value: 51 }).error, /non-zero/)
  assert.match(validateMassStaminaAdjustBody({ mode: 'delta', value: -51 }).error, /non-zero/)
})

test('validateMassStaminaAdjustBody absolute mode accepts [0,50], rejects out-of-range', () => {
  assert.deepEqual(validateMassStaminaAdjustBody({ mode: 'absolute', value: 10 }), { mode: 'absolute', value: 10 })
  assert.deepEqual(validateMassStaminaAdjustBody({ mode: 'absolute', value: 0 }), { mode: 'absolute', value: 0 })
  assert.match(validateMassStaminaAdjustBody({ mode: 'absolute', value: -1 }).error, /between 0 and 50/)
  assert.match(validateMassStaminaAdjustBody({ mode: 'absolute', value: 51 }).error, /between 0 and 50/)
})
