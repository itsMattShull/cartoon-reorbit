import test from 'node:test'
import assert from 'node:assert/strict'
import { solveForTargetWinRate, estimateWinRate, simulateRaidTrial } from '../server/utils/cmoonRaidBalance.js'

// Lower trial counts than the admin endpoint's own defaults, trading a little precision for
// test-suite speed — still enough to keep the result within a sane band of the 25% target, not so
// low that this flakes. The solver's own `targetReached` flag is the real guard against silently
// lying about hitting the target; these tests just confirm it does its job.
const FAST = { searchTrials: 2000, finalTrials: 8000 }

test('simulateRaidTrial returns one of the three known outcomes', () => {
  const outcome = simulateRaidTrial({
    bossHp: 100, attackChancePercent: 50, critChanceFromPercent: 50, critChanceAgainstPercent: 50, playerHp: 7,
  })
  assert.ok(['WIN', 'WIPE', 'TIMEOUT'].includes(outcome))
})

test('solveForTargetWinRate converges near 25% for a mid-range HP target (no wind-up moves)', () => {
  const result = solveForTargetWinRate({ bossHp: 150, targetWinRatePercent: 25, ...FAST })
  assert.equal(result.attackAccuracyPercent, 100)
  assert.equal(result.baseDamage, 1)
  assert.equal(result.targetReached, true, `expected target reached, got ${JSON.stringify(result)}`)
  assert.ok(Math.abs(result.achievedWinRatePercent - 25) <= 5, `win rate ${result.achievedWinRatePercent} too far from 25%`)
})

test('solveForTargetWinRate converges near a different target percent too', () => {
  const result = solveForTargetWinRate({ bossHp: 120, targetWinRatePercent: 33, ...FAST })
  assert.equal(result.targetReached, true, `expected target reached, got ${JSON.stringify(result)}`)
  assert.ok(Math.abs(result.achievedWinRatePercent - 33) <= 5, `win rate ${result.achievedWinRatePercent} too far from 33%`)
})

test('solveForTargetWinRate honors real wind-up moves passed in, not just the generic assumptions', () => {
  const withoutTelegraph = solveForTargetWinRate({ bossHp: 100, targetWinRatePercent: 25, windUpMoves: [], ...FAST })
  const withTelegraph = solveForTargetWinRate({
    bossHp: 100, targetWinRatePercent: 25,
    windUpMoves: [{ occurrencePercent: 20, bonusType: 'HEAL_PARTY', bonusAmount: 2 }],
    ...FAST,
  })
  // A helpful telegraph should let the solver land on a HARDER attack chance (higher) for the
  // same target win rate, since the party has an extra survivability lever the no-telegraph case
  // doesn't — confirming the wind-up moves actually feed into the simulation, not just logged.
  assert.ok(
    withTelegraph.attackChancePercent > withoutTelegraph.attackChancePercent,
    `expected telegraph case to tolerate a higher attack chance (${withTelegraph.attackChancePercent}) than no-telegraph (${withoutTelegraph.attackChancePercent})`,
  )
})

test('solveForTargetWinRate reports targetReached: false rather than lying when the target is unreachable', () => {
  // An absurdly high boss HP can't be brought down to a 25% win rate even with every lever at its
  // most lenient bound — the solver must say so, not silently return a config claiming success.
  const result = solveForTargetWinRate({ bossHp: 20000, targetWinRatePercent: 25, ...FAST })
  assert.equal(result.targetReached, false)
})

test('estimateWinRate is bounded between 0 and 100', () => {
  const wr = estimateWinRate({ bossHp: 50, attackChancePercent: 50, critChanceFromPercent: 50, critChanceAgainstPercent: 50, playerHp: 7 }, 500)
  assert.ok(wr >= 0 && wr <= 100)
})
