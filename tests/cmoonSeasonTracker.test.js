import test from 'node:test'
import assert from 'node:assert/strict'

import { parseTrackerBody, isValidMetricType, isValidTargetValue, METRIC_TYPES } from '../server/utils/cmoonSeasonTracker.js'

test('isValidMetricType only accepts the known metric set', () => {
  for (const m of METRIC_TYPES) assert.equal(isValidMetricType(m), true)
  assert.equal(isValidMetricType('MADE_UP'), false)
  assert.equal(isValidMetricType(''), false)
})

test('isValidTargetValue requires a positive finite number within range', () => {
  assert.equal(isValidTargetValue(100), true)
  assert.equal(isValidTargetValue(0), false)
  assert.equal(isValidTargetValue(-5), false)
  assert.equal(isValidTargetValue(NaN), false)
  assert.equal(isValidTargetValue(Infinity), false)
  assert.equal(isValidTargetValue(2_000_000), false)
})

test('parseTrackerBody: create requires label, metricType, and targetValue', () => {
  const ok = parseTrackerBody({ label: 'NPC Victories', metricType: 'BATTLE_WINS', targetValue: 100 }, undefined)
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.data, { label: 'NPC Victories', metricType: 'BATTLE_WINS', targetValue: 100, active: true, sortOrder: 0 })

  assert.equal(parseTrackerBody({ metricType: 'BATTLE_WINS', targetValue: 100 }, undefined).ok, false)
  assert.equal(parseTrackerBody({ label: 'X', targetValue: 100 }, undefined).ok, false)
  assert.equal(parseTrackerBody({ label: 'X', metricType: 'BATTLE_WINS' }, undefined).ok, false)
})

test('parseTrackerBody: update preserves omitted fields from the existing row', () => {
  const existing = { label: 'Old', metricType: 'TEAM_SCORE', targetValue: 500, active: true, sortOrder: 2 }
  const parsed = parseTrackerBody({ targetValue: 750 }, existing)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.data, { label: 'Old', metricType: 'TEAM_SCORE', targetValue: 750, active: true, sortOrder: 2 })
})

test('parseTrackerBody: metricType can change after creation (no fought/locked history of its own)', () => {
  const existing = { label: 'X', metricType: 'BATTLE_WINS', targetValue: 10, active: true, sortOrder: 0 }
  const parsed = parseTrackerBody({ metricType: 'AVG_POINTS' }, existing)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.metricType, 'AVG_POINTS')
})
