// server/utils/czoneMailQueue.js
//
// The cZone Mail notification queue, deliberately kept OUT of queues.js.
//
// Importing queues.js instantiates every queue in the app (and one Redis
// connection each), and mintQueue throws outright when MINT_QUEUE_KEY is unset.
// The notify worker only needs this one queue, and it re-arms itself — so it
// must be able to import the scheduler without dragging in the mint/dissolve/
// auction queues.

import { Queue } from 'bullmq'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD?.trim() || undefined,
}

export const czoneMailNotifyQueue = new Queue(
  process.env.CZONE_MAIL_NOTIFY_QUEUE_KEY || 'czoneMailNotify',
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 500 },
    },
  }
)

// How long a recipient's notifications are batched before the worker fires.
// Ten cMails arriving in a minute become one "you have 10 new cMail" ping
// instead of ten separate pings — better for the player being messaged, and it
// keeps thread posts well inside Discord's per-channel limits.
export const CZONE_MAIL_NOTIFY_DEBOUNCE_MS = 60_000

// States meaning "this job has not run yet", so a pending job will already cover
// the message being scheduled now.
const PENDING_STATES = new Set(['delayed', 'waiting', 'waiting-children', 'prioritized'])

/**
 * Schedule (or extend) the pending notification job for one recipient.
 *
 * Uses a per-recipient jobId so concurrent sends coalesce into a single job. The
 * job carries no payload beyond the recipient: the worker reads whatever is
 * unnotified at fire time.
 */
export async function scheduleCzoneMailNotify(recipientId, delayMs = CZONE_MAIL_NOTIFY_DEBOUNCE_MS) {
  const jobId = `cmail:${recipientId}`

  const existing = await czoneMailNotifyQueue.getJob(jobId)
  if (existing) {
    let state = 'unknown'
    try { state = await existing.getState() } catch {}
    if (PENDING_STATES.has(state)) return

    // Everything else — completed, failed, active, or an orphaned job hash left
    // behind in Redis — must be cleared before re-adding. Checking only for
    // 'completed'/'failed' here is not enough: a hash that belongs to no set
    // reports 'unknown', and leaving it in place would make this jobId
    // un-addable and silently block that recipient's notifications forever.
    try { await existing.remove() } catch {}
  }

  try {
    await czoneMailNotifyQueue.add('notify', { recipientId }, { jobId, delay: delayMs })
  } catch {
    // Scheduling is best-effort. The worker re-reads every pending row at fire
    // time and re-arms itself while any remain, so a lost schedule delays a
    // notification rather than dropping it.
  }
}
