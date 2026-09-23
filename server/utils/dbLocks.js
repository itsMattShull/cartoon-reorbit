// server/utils/dbLocks.js
//
// Advisory-lock keys shared across cron jobs, for cases where two *different*
// jobs must never run at once — as opposed to the common per-job pattern
// (see economy-aggregate.js's withAdvisoryLock) of a job guarding only
// against overlapping with itself.
//
// USER_TABLE_BULK_WRITE_LOCK_KEY: held by every job that does a set-based
// UPDATE touching most/all of "User" in one statement — currently
// recomputeLastActivity (server/cron/sync-guild-members.js) and
// runCMoonPointsAggregate (server/cron/cmoon-points-aggregate.js). Both
// update rows in whatever order their own query plan happens to touch them,
// which doesn't agree between the two statements; if they land in the same
// tick (they used to: recomputeLastActivity fires at 04:00 America/Chicago,
// always on a :00 UTC minute, exactly matching one of runCMoonPointsAggregate's
// */15 firings) they can each hold locks the other is waiting on and Postgres
// kills one with a deadlock error. Sharing one advisory-lock key serializes
// them for free — whichever loses pg_try_advisory_lock just skips and picks
// the work up on its own next tick, same as the existing skip-and-log
// behavior every one of these jobs already has for self-overlap.
//
// Any future job that does a similar broad UPDATE...FROM against "User"
// should take this lock too rather than inventing its own key.
export const USER_TABLE_BULK_WRITE_LOCK_KEY = 384710226
