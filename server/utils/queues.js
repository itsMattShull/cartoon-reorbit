import { Queue } from 'bullmq'

export const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
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
