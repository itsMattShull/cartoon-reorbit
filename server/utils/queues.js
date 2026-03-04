import { Queue } from 'bullmq'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

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
