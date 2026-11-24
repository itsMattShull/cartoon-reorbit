// server/utils/dailyStreakCycle.js
// The Daily Streak milestone/cycle math, pulled out into its own zero-dependency file (same
// "pure function extracted from the feature module, testable via a direct import with no heavy
// transitive imports" convention as e.g. server/utils/myOrbitPathfinding.js) — server/utils/
// dailyStreak.js itself eagerly imports achievements.js (which imports queues.js, which
// constructs a BullMQ Queue at module load and throws without MINT_QUEUE_KEY/Redis configured),
// so a plain unit test importing this math directly from THAT file would fail to even load
// under a bare `node --test` run with no environment set up. dailyStreak.js re-exports this
// for its own internal use, so there is still only one implementation.

/**
 * Which configured milestone day a raw cumulative streak count (`streakDay`, 1-based) should
 * grant on, given the highest configured day (`maxDay`, 0/null if nothing is configured yet) and
 * whether the whole schedule repeats. Returns null when there is nothing to grant:
 *  - no rewards configured at all (maxDay falsy)
 *  - streakDay is past maxDay and repeat is disabled (the streak keeps counting, rewards just stop)
 * `((streakDay - 1) % maxDay) + 1` rather than a plain `streakDay % maxDay`, so the LAST day of
 * each cycle (streakDay === maxDay, or maxDay*2, etc.) maps back to maxDay itself, never 0.
 */
export function resolveDailyStreakEffectiveDay(streakDay, maxDay, repeatEnabled) {
  if (!maxDay || maxDay <= 0) return null
  if (streakDay <= maxDay) return streakDay
  if (!repeatEnabled) return null
  return ((streakDay - 1) % maxDay) + 1
}
