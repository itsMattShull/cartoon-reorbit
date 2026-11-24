import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDailyStreakEffectiveDay } from '../server/utils/dailyStreakCycle.js'
import { allEnabledDailyTasksComplete, allEnabledEveningTasksComplete, allEnabledMorningTasksComplete } from '../server/utils/dailyTaskStatus.js'

// ── resolveDailyStreakEffectiveDay ──────────────────────────────────────────────────────────

test('effective day is the streak day itself while still inside the configured range', () => {
  assert.equal(resolveDailyStreakEffectiveDay(1, 25, false), 1)
  assert.equal(resolveDailyStreakEffectiveDay(3, 25, false), 3)
  assert.equal(resolveDailyStreakEffectiveDay(25, 25, false), 25)
  assert.equal(resolveDailyStreakEffectiveDay(25, 25, true), 25) // exact boundary, repeat on or off: same either way
})

test('past the max day with repeat disabled: nothing to grant', () => {
  assert.equal(resolveDailyStreakEffectiveDay(26, 25, false), null)
  assert.equal(resolveDailyStreakEffectiveDay(1000, 25, false), null)
})

test('past the max day with repeat enabled: wraps, and the last day of each cycle maps to maxDay, never 0', () => {
  assert.equal(resolveDailyStreakEffectiveDay(26, 25, true), 1)
  assert.equal(resolveDailyStreakEffectiveDay(28, 25, true), 3)
  assert.equal(resolveDailyStreakEffectiveDay(50, 25, true), 25) // 2nd cycle's last day
  assert.equal(resolveDailyStreakEffectiveDay(51, 25, true), 1) // 3rd cycle's first day
  assert.equal(resolveDailyStreakEffectiveDay(75, 25, true), 25) // 3rd cycle's last day
})

test('no rewards configured at all (maxDay falsy): nothing to grant, regardless of repeat', () => {
  assert.equal(resolveDailyStreakEffectiveDay(1, 0, false), null)
  assert.equal(resolveDailyStreakEffectiveDay(1, 0, true), null)
  assert.equal(resolveDailyStreakEffectiveDay(5, null, true), null)
})

// ── allEnabledDailyTasksComplete ─────────────────────────────────────────────────────────────

const baseConfig = {
  dailyLoginPoints: 500, dailyPointLimit: 250, tkoDailyPointLimit: 250,
  czoneVisitMaxPerDay: 10, czoneVisitPoints: 20, winwheelMaxDailySpins: 3, lottoCountPerDay: 1
}
const allDone = {
  dailyLoginComplete: true, czoneVisitComplete: true, gamePointsComplete: true,
  tkoPointsComplete: true, winwheelComplete: true, lottoComplete: true
}

test('true when every task is complete', () => {
  assert.equal(allEnabledDailyTasksComplete({ status: allDone, config: baseConfig }), true)
})

test('false when daily login is missing, even if every other task is somehow complete', () => {
  assert.equal(allEnabledDailyTasksComplete({ status: { ...allDone, dailyLoginComplete: false }, config: baseConfig }), false)
})

test('false when any one enabled optional task is missing', () => {
  for (const key of ['czoneVisitComplete', 'gamePointsComplete', 'tkoPointsComplete', 'winwheelComplete', 'lottoComplete']) {
    assert.equal(
      allEnabledDailyTasksComplete({ status: { ...allDone, [key]: false }, config: baseConfig }),
      false,
      `expected false when ${key} is incomplete`
    )
  }
})

test('a task whose admin-configured limit is 0 is skipped (not required), matching daily.get.js\'s own "0 = not a real task" rule', () => {
  const config = { ...baseConfig, czoneVisitMaxPerDay: 0, winwheelMaxDailySpins: 0, lottoCountPerDay: 0 }
  const status = { ...allDone, czoneVisitComplete: false, winwheelComplete: false, lottoComplete: false }
  assert.equal(allEnabledDailyTasksComplete({ status, config }), true)
})

test('lottoCountPerDay of -1 (disabled sentinel) also skips the lotto task', () => {
  const config = { ...baseConfig, lottoCountPerDay: -1 }
  const status = { ...allDone, lottoComplete: false }
  assert.equal(allEnabledDailyTasksComplete({ status, config }), true)
})

test('daily login is never skippable, even with every optional task disabled', () => {
  const config = { ...baseConfig, czoneVisitMaxPerDay: 0, dailyPointLimit: 0, tkoDailyPointLimit: 0, winwheelMaxDailySpins: 0, lottoCountPerDay: 0 }
  assert.equal(allEnabledDailyTasksComplete({ status: { ...allDone, dailyLoginComplete: false }, config }), false)
  assert.equal(allEnabledDailyTasksComplete({ status: allDone, config }), true)
})

// ── allEnabledEveningTasksComplete / allEnabledMorningTasksComplete ─────────────────────────────
// The split that lets server/utils/dailyStreak.js defer a verdict on just the morning-rooted
// tasks (Winwheel/Lotto) instead of resetting a streak before their own 8am deadline.

test('evening check ignores Winwheel/Lotto entirely, in either direction', () => {
  assert.equal(allEnabledEveningTasksComplete({ status: { ...allDone, winwheelComplete: false, lottoComplete: false }, config: baseConfig }), true)
  assert.equal(allEnabledMorningTasksComplete({ status: { ...allDone, winwheelComplete: false, lottoComplete: false }, config: baseConfig }), false)
})

test('evening check still requires daily login and every enabled evening-rooted task', () => {
  assert.equal(allEnabledEveningTasksComplete({ status: { ...allDone, dailyLoginComplete: false }, config: baseConfig }), false)
  for (const key of ['czoneVisitComplete', 'gamePointsComplete', 'tkoPointsComplete']) {
    assert.equal(allEnabledEveningTasksComplete({ status: { ...allDone, [key]: false }, config: baseConfig }), false, `expected false when ${key} is incomplete`)
  }
})

test('morning check is vacuously true when both Winwheel and Lotto are disabled, and ignores evening tasks', () => {
  const config = { ...baseConfig, winwheelMaxDailySpins: 0, lottoCountPerDay: 0 }
  assert.equal(allEnabledMorningTasksComplete({ status: { ...allDone, winwheelComplete: false, lottoComplete: false }, config }), true)
  assert.equal(allEnabledMorningTasksComplete({ status: { ...allDone, dailyLoginComplete: false, czoneVisitComplete: false }, config: baseConfig }), true)
})

test('allEnabledDailyTasksComplete is exactly the AND of both halves', () => {
  const status = { ...allDone, winwheelComplete: false }
  assert.equal(allEnabledEveningTasksComplete({ status, config: baseConfig }), true)
  assert.equal(allEnabledMorningTasksComplete({ status, config: baseConfig }), false)
  assert.equal(allEnabledDailyTasksComplete({ status, config: baseConfig }), false)
})
