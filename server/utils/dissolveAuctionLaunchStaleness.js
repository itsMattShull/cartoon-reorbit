// server/utils/dissolveAuctionLaunchStaleness.js
// Split out of server/utils/queues.js (re-exported there) so this pure check
// can be unit tested without eagerly constructing that file's BullMQ Queue
// instances — see tests/cmoonEffectTypes.test.js's comment on the same issue.

/**
 * True when a dissolve-auction-launch job's stamped target time no longer
 * matches its DissolveAuctionQueue entry's current scheduledFor — meaning the
 * entry was rescheduled (or unscheduled) after this job was already `active`
 * and past the point scheduleDissolveAuctionLaunch could cancel/replace it.
 * `jobScheduledForMs` is undefined for jobs enqueued before this field
 * existed; those are never treated as stale.
 * @param {number|undefined} jobScheduledForMs
 * @param {Date|string|null} entryScheduledFor
 * @returns {boolean}
 */
export function isStaleDissolveLaunchJob(jobScheduledForMs, entryScheduledFor) {
  if (jobScheduledForMs == null) return false
  const entryScheduledForMs = entryScheduledFor ? new Date(entryScheduledFor).getTime() : null
  return entryScheduledForMs !== jobScheduledForMs
}
