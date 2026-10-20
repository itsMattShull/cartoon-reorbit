import { Queue } from 'bullmq'
import { isStaleDissolveLaunchJob } from './dissolveAuctionLaunchStaleness.js'

export { isStaleDissolveLaunchJob }

export const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD?.trim() || undefined,
}

const connection = redisConnection

export const mintQueue = new Queue(process.env.MINT_QUEUE_KEY, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 500 },
  },
})

// Queue for processing daily achievements per-user
export const achievementsQueue = new Queue(
  process.env.ACHIEVEMENTS_QUEUE_KEY || 'achievementsQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail:     { count: 500 },
    },
  }
)

/**
 * Queue achievement checks for a set of users in one bulk add (a single Redis round trip per
 * chunk, not one awaited call per user).
 *
 * Each job is de-duplicated per user: while a check for that user is already waiting or running,
 * another add for the same user is dropped instead of stacking. The dedup key clears the moment
 * the job finishes, so a later add (e.g. after their cMoon points change again) queues normally.
 * This is what stops the 45-minute cMoon aggregate, the daily enqueue and manual admin enqueues
 * from piling duplicate work onto the same users.
 * @param {string[]} userIds
 */
export async function enqueueAchievementChecks(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))]
  const CHUNK = 500
  for (let i = 0; i < ids.length; i += CHUNK) {
    await achievementsQueue.addBulk(
      ids.slice(i, i + CHUNK).map(userId => ({
        name: 'processUserAchievements',
        data: { userId },
        opts: { deduplication: { id: `ach-${userId}` } },
      }))
    )
  }
  return ids.length
}

// Queue for dissolving user accounts (potentially large, runs outside a single transaction)
export const dissolveQueue = new Queue(
  process.env.DISSOLVE_QUEUE_KEY || 'dissolveQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 100 },
    },
  }
)

// Queue for transferring points/cToons from one user to another (admin action)
export const transferQueue = new Queue(
  process.env.TRANSFER_QUEUE_KEY || 'transferQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 100 },
    },
  }
)

// Queue for closing auctions at their exact endAt time
export const auctionCloseQueue = new Queue(
  process.env.AUCTION_CLOSE_QUEUE_KEY || 'auctionClose',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 500 },
    },
  }
)

/**
 * Schedule (or reschedule) the delayed BullMQ job that closes an auction.
 * Safe to call any time endAt changes — handles all job states.
 * @param {string} auctionId
 * @param {Date|string} endAt
 */
export async function scheduleAuctionClose(auctionId, endAt) {
  const delay = Math.max(0, new Date(endAt).getTime() - Date.now())
  const existing = await auctionCloseQueue.getJob(auctionId)
  if (existing) {
    const state = await existing.getState()
    if (state === 'active') return // currently being processed — don't interfere
    try { await existing.remove() } catch {}
  }
  await auctionCloseQueue.add('close', { auctionId }, { jobId: auctionId, delay })
}

/**
 * Cancel the pending auto-close job for an auction that's about to be deleted.
 * Returns { active: true } without removing anything if the job is currently
 * being processed — callers should treat that as "not safe to delete yet"
 * rather than deleting the Auction row out from under an in-flight close.
 * @param {string} auctionId
 */
export async function cancelAuctionClose(auctionId) {
  const existing = await auctionCloseQueue.getJob(auctionId)
  if (!existing) return { active: false, removed: false }
  const state = await existing.getState()
  if (state === 'active') return { active: true, removed: false }
  try {
    await existing.remove()
    return { active: false, removed: true }
  } catch (err) {
    return { active: false, removed: false, error: err?.message || String(err) }
  }
}

// Queue for closing time-based mint windows at their mintEndDate
export const mintEndQueue = new Queue(
  process.env.MINT_END_QUEUE_KEY || 'mintEndQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 500 },
    },
  }
)

/**
 * Schedule (or reschedule) the delayed BullMQ job that closes a time-based mint window.
 * Safe to call any time mintEndDate changes — handles all job states.
 * @param {string} ctoonId
 * @param {Date|string} mintEndDate
 */
export async function scheduleMintEnd(ctoonId, mintEndDate) {
  const delay = Math.max(0, new Date(mintEndDate).getTime() - Date.now())
  const existing = await mintEndQueue.getJob(String(ctoonId))
  if (existing) {
    const state = await existing.getState()
    if (state === 'active') return
    try { await existing.remove() } catch {}
  }
  await mintEndQueue.add('closeMint', { ctoonId }, { jobId: String(ctoonId), delay })
}

/**
 * Cancel a pending mint-end job (e.g. when switching back to "defined" mode).
 * @param {string} ctoonId
 */
export async function cancelMintEnd(ctoonId) {
  const existing = await mintEndQueue.getJob(String(ctoonId))
  if (existing) { try { await existing.remove() } catch {} }
}

// Queue for launching individual dissolve-queue auctions at their scheduled time
export const dissolveAuctionLaunchQueue = new Queue(
  process.env.DISSOLVE_AUCTION_LAUNCH_QUEUE_KEY || 'dissolveAuctionLaunch',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 500 },
    },
  }
)

/**
 * Schedule (or reschedule) a delayed BullMQ job that creates one dissolve auction.
 * Uses the DissolveAuctionQueue.id as the BullMQ job ID for easy lookup/cancellation.
 *
 * The target time is stamped onto the job itself (scheduledForMs) so the
 * worker can tell a stale job apart from the entry's current schedule — if a
 * job is already `active` when a reschedule comes in (its delay already
 * elapsed and BullMQ has dequeued it), this function can't cancel or replace
 * it, but the worker can detect the mismatch against the entry's freshly
 * updated scheduledFor and defer instead of acting on out-of-date data. See
 * server/workers/dissolve-auction-launch.worker.js.
 * @param {string} queueEntryId
 * @param {Date|string} scheduledFor
 */
export async function scheduleDissolveAuctionLaunch(queueEntryId, scheduledFor) {
  const scheduledForMs = new Date(scheduledFor).getTime()
  const delay = Math.max(0, scheduledForMs - Date.now())
  const existing = await dissolveAuctionLaunchQueue.getJob(queueEntryId)
  if (existing) {
    const state = await existing.getState()
    if (state === 'active') return
    try { await existing.remove() } catch {}
  }
  await dissolveAuctionLaunchQueue.add(
    'launch',
    { queueEntryId, scheduledForMs },
    { jobId: queueEntryId, delay }
  )
}

/**
 * Cancel a pending dissolve auction launch job.
 * @param {string} queueEntryId
 */
export async function cancelDissolveAuctionLaunch(queueEntryId) {
  const existing = await dissolveAuctionLaunchQueue.getJob(queueEntryId)
  if (existing) { try { await existing.remove() } catch {} }
}

// Queue for redeeming Holiday Items (burn source cToon → mint reward cToon).
// The whole burn+mint+record critical section runs inside the worker
// (see server/workers/holiday-redeem.worker.js) rather than in the HTTP
// request handler, so it survives the nuxt-server process being reloaded
// or killed mid-request — the job keeps running in the separate, longer-lived
// worker process and Redis keeps the job around if that process restarts too.
export const holidayRedeemQueue = new Queue(
  process.env.HOLIDAY_REDEEM_QUEUE_KEY || 'holidayRedeemQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 500 },
    },
  }
)

// Queue for analysing survey text (embeddings, MinHash, stylometrics)
export const contentAnalysisQueue = new Queue(
  process.env.CONTENT_ANALYSIS_QUEUE_KEY || 'contentAnalysis',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 500 },
    },
  }
)

// Queue for the admin "Recalculate cMoon Points" tool (server/workers/cmoon-rank-recalc.worker.js)
// — a one-time, one-user-at-a-time correction pass, not a recurring cron. A single fixed jobId
// (see server/api/admin/cmoons/recalculate-points.post.js) keeps two admin clicks from starting
// two overlapping runs.
export const cmoonRankRecalcQueue = new Queue(
  process.env.CMOON_RANK_RECALC_QUEUE_KEY || 'cmoonRankRecalcQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 20 },
      removeOnFail:     { count: 20 },
    },
  }
)

// Queue for the admin "Revoke Invalid cMoon Rank Prizes" tool
// (server/workers/cmoon-prize-revoke.worker.js) — claws back rank-tier prize cToons a member
// only received because of the old cMoonPoints bug, and resets the underlying achievement/claim
// so they can legitimately re-earn it. Same one-time, fixed-jobId shape as cmoonRankRecalcQueue.
export const cmoonPrizeRevokeQueue = new Queue(
  process.env.CMOON_PRIZE_REVOKE_QUEUE_KEY || 'cmoonPrizeRevokeQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 20 },
      removeOnFail:     { count: 20 },
    },
  }
)

// Queue for the admin "Backfill cMoon Points" tool (server/workers/cmoon-daily-task-backfill.worker.js)
// — a one-time, admin-triggered, one-user-at-a-time grant of a flat bonus to every current cMoon
// member (optionally skipping anyone who already has cMoon points). Unlike cmoonRankRecalcQueue,
// this is NOT given a single fixed jobId: an admin may legitimately want to run it again later
// (a fresh batch of members, a different amount), each run's own CMoonScoreLog rows are keyed by
// that run's jobId (see the worker), so a stale jobId would only block re-running, never protect
// against it — see server/api/admin/cmoons/backfill-points.post.js for how in-flight runs are
// instead detected by scanning the queue's active/waiting jobs.
export const cmoonDailyTaskBackfillQueue = new Queue(
  process.env.CMOON_DAILY_TASK_BACKFILL_QUEUE_KEY || 'cmoonDailyTaskBackfillQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 20 },
      removeOnFail:     { count: 20 },
    },
  }
)

// Queue for the admin "Resolve Dissolve Misfires" tool
// (server/workers/dissolve-misfire-resolve.worker.js) — restores a cToon to its original auction
// winner and compensates everyone else who held it since, one misfire at a time, per-row or in
// bulk. Not given a single fixed jobId (like cmoonDailyTaskBackfillQueue, unlike
// cmoonRankRecalcQueue): an admin may run this again later for a fresh batch of misfires, and
// each run's own job.data.misfireIds scopes it — see
// server/api/admin/dissolve-misfires/resolve.post.js for how an in-flight run is instead detected
// by scanning the queue's own active/waiting/delayed jobs.
export const dissolveMisfireResolveQueue = new Queue(
  process.env.DISSOLVE_MISFIRE_RESOLVE_QUEUE_KEY || 'dissolveMisfireResolveQueue',
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 20 },
      removeOnFail:     { count: 20 },
    },
  }
)

// ─── Exact-time "scheduled events" ──────────────────────────────────────────────
// Delayed jobs that fire a scheduled event at the exact minute it was set for — a pack going live
// or off in cMart, an AuctionOnly row starting, an announcement posting — instead of waiting for
// the next poll of a cron sweep. Same pattern as scheduleAuctionClose / scheduleMintEnd above:
// the jobId is derived from the thing being scheduled so a re-save replaces rather than duplicates.
// The jobs are handled by the critical scheduler (server/cron/scheduler.js); each handler is
// idempotent and re-checks the DB, so the cron sweeps that still run every few minutes stay a pure
// safety net — if a job here is lost (Redis flush) the sweep catches it a few minutes late.
export const SCHEDULED_EVENTS_QUEUE_NAME = process.env.SCHEDULED_EVENTS_QUEUE_KEY || 'scheduledEvents'

/** Runs a best-effort scheduling side effect: a Redis hiccup must never fail the admin's save. */
export async function bestEffort(label, fn) {
  try { await fn() } catch (err) { console.error(`[scheduled-events] ${label} failed:`, err?.message || err) }
}

export const scheduledEventsQueue = new Queue(SCHEDULED_EVENTS_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 200 },
  },
})

async function replaceDelayedJob(name, jobId, data, runAt) {
  const delay = Math.max(0, new Date(runAt).getTime() - Date.now())
  const existing = await scheduledEventsQueue.getJob(jobId)
  if (existing) {
    const state = await existing.getState()
    if (state === 'active') return
    try { await existing.remove() } catch {}
  }
  await scheduledEventsQueue.add(name, data, { jobId, delay })
}

async function removeDelayedJob(jobId) {
  const existing = await scheduledEventsQueue.getJob(jobId)
  if (!existing) return
  try { await existing.remove() } catch {}
}

/**
 * (Re)schedule a pack's go-live / go-off jobs. Pass null for a time that isn't set, or one that
 * has already passed and should not fire again.
 */
export async function schedulePackToggle(packId, scheduledAt, scheduledOffAt) {
  const id = String(packId)
  if (scheduledAt) await replaceDelayedJob('packOn', `pack-on-${id}`, { packId: id }, scheduledAt)
  else await removeDelayedJob(`pack-on-${id}`)
  if (scheduledOffAt) await replaceDelayedJob('packOff', `pack-off-${id}`, { packId: id }, scheduledOffAt)
  else await removeDelayedJob(`pack-off-${id}`)
}

export async function cancelPackToggle(packId) {
  const id = String(packId)
  await removeDelayedJob(`pack-on-${id}`)
  await removeDelayedJob(`pack-off-${id}`)
}

/** (Re)schedule the job that activates an AuctionOnly row at its startsAt. */
export async function scheduleAuctionOnlyStart(auctionOnlyId, startsAt) {
  const id = String(auctionOnlyId)
  if (!startsAt) return removeDelayedJob(`auction-only-${id}`)
  await replaceDelayedJob('auctionOnlyStart', `auction-only-${id}`, { auctionOnlyId: id }, startsAt)
}

export async function cancelAuctionOnlyStart(auctionOnlyId) {
  await removeDelayedJob(`auction-only-${String(auctionOnlyId)}`)
}

/** (Re)schedule the job that posts an announcement to Discord at its scheduledAt. */
export async function scheduleAnnouncementSend(announcementId, scheduledAt) {
  const id = String(announcementId)
  if (!scheduledAt) return removeDelayedJob(`announcement-${id}`)
  await replaceDelayedJob('announcementSend', `announcement-${id}`, { announcementId: id }, scheduledAt)
}

export async function cancelAnnouncementSend(announcementId) {
  await removeDelayedJob(`announcement-${String(announcementId)}`)
}

/**
 * (Re)schedule the job that applies the Winball grand-prize schedule at a row's startsAt. The
 * handler re-reads the schedule, so it is idempotent; a 1s buffer keeps it from firing just before
 * the row becomes "active" (startsAt <= now).
 */
export async function scheduleWinballPrizeUpdate(scheduleId, startsAt) {
  const id = String(scheduleId)
  if (!startsAt) return removeDelayedJob(`winball-prize-${id}`)
  await replaceDelayedJob('winballPrizeUpdate', `winball-prize-${id}`, { scheduleId: id }, new Date(startsAt).getTime() + 1000)
}

export async function cancelWinballPrizeUpdate(scheduleId) {
  await removeDelayedJob(`winball-prize-${String(scheduleId)}`)
}
