import { Worker } from 'bullmq'
import { processAchievementsForUser } from '../../server/utils/achievements.js'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const QUEUE_KEY = process.env.ACHIEVEMENTS_QUEUE_KEY || 'achievementsQueue'

const worker = new Worker(QUEUE_KEY, async job => {
  const { userId } = job.data || {}
  if (!userId) return
  await processAchievementsForUser(String(userId))
}, { connection })

worker.on('completed', job => {
  // console.log(`Achievements job ${job.id} done`)
})
worker.on('failed', (job, err) => {
  // console.warn(`Achievements job ${job?.id} failed: ${err?.message}`)
})

export default worker

