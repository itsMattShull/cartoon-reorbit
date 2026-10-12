import { Worker } from 'bullmq'
import { processAchievementsForUser } from '../../server/utils/achievements.js'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const QUEUE_KEY = process.env.ACHIEVEMENTS_QUEUE_KEY || 'achievementsQueue'

// Each job is one user's whole pass (see processAchievementsForUser). Running a few at once is what
// lets the daily all-users batch finish in minutes instead of draining one user at a time; the
// default of 1 was the bottleneck. Kept modest so it doesn't crowd the shared DB pool.
// ACHIEVEMENTS_WORKER_CONCURRENCY overrides it without a code change.
const CONCURRENCY = Math.max(1, Number(process.env.ACHIEVEMENTS_WORKER_CONCURRENCY || 4))

const worker = new Worker(QUEUE_KEY, async job => {
  const { userId } = job.data || {}
  if (!userId) return
  await processAchievementsForUser(String(userId))
}, { connection, concurrency: CONCURRENCY })

worker.on('completed', job => {
  // console.log(`Achievements job ${job.id} done`)
})
worker.on('failed', (job, err) => {
  // console.warn(`Achievements job ${job?.id} failed: ${err?.message}`)
})

export default worker

