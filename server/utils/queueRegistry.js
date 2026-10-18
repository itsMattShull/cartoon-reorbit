// server/utils/queueRegistry.js
//
// Every BullMQ queue the admin Queue Monitor can inspect, keyed by its real queue name. The queue
// objects come from server/utils/queues.js (the same instances the app already holds open); the two
// cron-scheduler queues are opened here because only the cron processes create them.
import { Queue } from 'bullmq'
import * as q from './queues.js'
import { cronQueueName, TIER_CRITICAL, TIER_MAINTENANCE } from '../cron/jobs.js'

const ENTRIES = [
  { queue: q.mintQueue, label: 'Mint', description: 'cToon minting (cMart, packs, codes, achievements)' },
  { queue: q.achievementsQueue, label: 'Achievements', description: 'Per-user achievement checks' },
  { queue: q.auctionCloseQueue, label: 'Auction close', description: 'Closes auctions at their end time' },
  { queue: q.mintEndQueue, label: 'Mint end', description: 'Closes time-based mint windows' },
  { queue: q.scheduledEventsQueue, label: 'Scheduled events', description: 'Exact-time pack on/off, AuctionOnly start, announcements' },
  { queue: q.dissolveAuctionLaunchQueue, label: 'Dissolve auction launch', description: 'Launches dissolve-queue auctions' },
  { queue: q.dissolveQueue, label: 'Account dissolve', description: 'Account dissolution' },
  { queue: q.transferQueue, label: 'Admin transfer', description: 'Admin user-to-user asset transfers' },
  { queue: q.holidayRedeemQueue, label: 'Holiday redeem', description: 'Holiday Item open/redeem' },
  { queue: q.contentAnalysisQueue, label: 'Content analysis', description: 'Survey text analysis' },
  { queue: q.cmoonRankRecalcQueue, label: 'cMoon rank recalc', description: 'Admin one-time cMoon points recalculation' },
  { queue: q.cmoonPrizeRevokeQueue, label: 'cMoon prize revoke', description: 'Admin one-time rank prize revoke' },
  { queue: q.cmoonDailyTaskBackfillQueue, label: 'cMoon backfill', description: 'Admin one-time cMoon points backfill' },
  { queue: q.dissolveMisfireResolveQueue, label: 'Dissolve misfire resolve', description: 'Admin tool restoring misfired dissolve auctions to their rightful owner' },
]

let registry = null

function build() {
  const map = new Map()
  for (const e of ENTRIES) {
    if (e.queue?.name) map.set(e.queue.name, { name: e.queue.name, label: e.label, description: e.description, queue: e.queue })
  }
  const cron = [
    [TIER_CRITICAL, 'Cron — critical', 'Time-critical recurring jobs (BullMQ job schedulers)'],
    [TIER_MAINTENANCE, 'Cron — maintenance', 'Heavy recurring jobs, one at a time (BullMQ job schedulers)'],
  ]
  for (const [tier, label, description] of cron) {
    const name = cronQueueName(tier)
    if (!map.has(name)) {
      map.set(name, { name, label, description, queue: new Queue(name, { connection: q.redisConnection }), isCron: true })
    }
  }
  return map
}

export function getQueueRegistry() {
  if (!registry) registry = build()
  return registry
}

export function getQueueEntry(name) {
  return getQueueRegistry().get(String(name)) || null
}
