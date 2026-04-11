import { Queue } from 'bullmq'

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
 * @param {string} queueEntryId
 * @param {Date|string} scheduledFor
 */
export async function scheduleDissolveAuctionLaunch(queueEntryId, scheduledFor) {
  const delay = Math.max(0, new Date(scheduledFor).getTime() - Date.now())
  const existing = await dissolveAuctionLaunchQueue.getJob(queueEntryId)
  if (existing) {
    const state = await existing.getState()
    if (state === 'active') return
    try { await existing.remove() } catch {}
  }
  await dissolveAuctionLaunchQueue.add(
    'launch',
    { queueEntryId },
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
