import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { solveForTargetWinRate, estimateWinRate, simulateRaidTrial } from '../server/utils/cmoonRaidBalance.js'

// Lower trial counts than the admin endpoint's own defaults, trading a little precision for
// test-suite speed. The solver's own `targetReached` flag is the real guard against silently
// lying about hitting the target; these tests just confirm it does its job.
const FAST = { searchTrials: 2000, finalTrials: 8000 }

// The solver is a Monte-Carlo search on Math.random(). At FAST's trial counts a single estimate is only good to about
// +/-1%, the same size as the search's +/-1.5% acceptance band, so on roughly 2% of UNSEEDED runs the 25% test below
// "converged" on a lucky reading and the larger re-check then landed just outside the band (e.g. 28.7% for a 25%
// target) — a red CI run on code that hadn't changed. Seeding makes every run draw the same dice. The seed isn't
// special: 147 of 150 nearby seeds pass this suite; it is simply one that does, so a failure here now means the
// solver's behaviour changed rather than the dice.
const SEED = 1
function mulberry32 (a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
let realRandom
beforeEach(() => { realRandom = Math.random; Math.random = mulberry32(SEED) })
afterEach(() => { Math.random = realRandom })

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

test('wind-up moves are rolled independently per round, not as one cumulative roll', () => {
  // Two 50%-chance moves firing independently give P(any fires) = 1 - 0.5*0.5 = 75% per round —
  // identical to a single 75%-chance move with the same bonus. A cumulative single-roll bug (two
  // 50% moves summing to 100%) would make the two-move case ALWAYS telegraph, which would show up
  // as a clearly different win rate from the single-75%-move case. Same params otherwise, so the
  // two configs' win rates should land close together.
  const params = { bossHp: 100, attackChancePercent: 50, critChanceFromPercent: 50, critChanceAgainstPercent: 50, playerHp: 7 }
  const twoMoves = estimateWinRate({
    ...params,
    windUpMoves: [
      { occurrencePercent: 50, bonusType: 'HEAL_PARTY', bonusAmount: 2 },
      { occurrencePercent: 50, bonusType: 'HEAL_PARTY', bonusAmount: 2 },
    ],
  }, 20000)
  const oneMove = estimateWinRate({
    ...params,
    windUpMoves: [{ occurrencePercent: 75, bonusType: 'HEAL_PARTY', bonusAmount: 2 }],
  }, 20000)
  assert.ok(
    Math.abs(twoMoves - oneMove) <= 4,
    `two 50% moves (${twoMoves}%) should behave like one 75% move (${oneMove}%), not like an always-fires telegraph`,
  )
})

test('estimateWinRate is bounded between 0 and 100', () => {
  const wr = estimateWinRate({ bossHp: 50, attackChancePercent: 50, critChanceFromPercent: 50, critChanceAgainstPercent: 50, playerHp: 7 }, 500)
  assert.ok(wr >= 0 && wr <= 100)
})
