import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HP_TARGET_MIN, HP_TARGET_MAX, HP_DELTA_MIN, HP_DELTA_MAX,
  validateSetUserHpBody, validateMassHpAdjustBody,
} from '../server/utils/cmoonHpAdjustmentValidation.js'

test('bounds mirror MAX_HP_MIN/MAX_HP_MAX from cmoonEnemy.js', () => {
  assert.equal(HP_TARGET_MIN, 1)
  assert.equal(HP_TARGET_MAX, 10000)
  assert.equal(HP_DELTA_MIN, -10000)
  assert.equal(HP_DELTA_MAX, 10000)
})

test('validateSetUserHpBody accepts a valid integer target', () => {
  const res = validateSetUserHpBody({ targetHp: 20 })
  assert.equal(res.error, undefined)
  assert.equal(res.targetHp, 20)
})

test('validateSetUserHpBody rejects non-integer, out-of-range, and missing values', () => {
  assert.match(validateSetUserHpBody({ targetHp: 0 }).error, /between 1 and 10000/)
  assert.match(validateSetUserHpBody({ targetHp: 10001 }).error, /between 1 and 10000/)
  assert.match(validateSetUserHpBody({ targetHp: 5.5 }).error, /between 1 and 10000/)
  assert.match(validateSetUserHpBody({}).error, /between 1 and 10000/)
  assert.match(validateSetUserHpBody({ targetHp: 'abc' }).error, /between 1 and 10000/)
})

test('validateMassHpAdjustBody requires a known mode', () => {
  assert.match(validateMassHpAdjustBody({ mode: 'nope', value: 5 }).error, /mode must be/)
  assert.match(validateMassHpAdjustBody({ value: 5 }).error, /mode must be/)
})

test('validateMassHpAdjustBody delta mode accepts a non-zero in-range integer, rejects zero/out-of-range', () => {
  assert.deepEqual(validateMassHpAdjustBody({ mode: 'delta', value: 5 }), { mode: 'delta', value: 5 })
  assert.deepEqual(validateMassHpAdjustBody({ mode: 'delta', value: -5 }), { mode: 'delta', value: -5 })
  assert.match(validateMassHpAdjustBody({ mode: 'delta', value: 0 }).error, /non-zero/)
  assert.match(validateMassHpAdjustBody({ mode: 'delta', value: 10001 }).error, /non-zero/)
  assert.match(validateMassHpAdjustBody({ mode: 'delta', value: -10001 }).error, /non-zero/)
})

test('validateMassHpAdjustBody absolute mode accepts [1,10000], rejects 0 and out-of-range', () => {
  assert.deepEqual(validateMassHpAdjustBody({ mode: 'absolute', value: 20 }), { mode: 'absolute', value: 20 })
  assert.match(validateMassHpAdjustBody({ mode: 'absolute', value: 0 }).error, /between 1 and 10000/)
  assert.match(validateMassHpAdjustBody({ mode: 'absolute', value: -5 }).error, /between 1 and 10000/)
  assert.match(validateMassHpAdjustBody({ mode: 'absolute', value: 10001 }).error, /between 1 and 10000/)
})
