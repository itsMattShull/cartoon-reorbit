import { prisma } from '@/server/prisma'
import { mintQueue } from '../../../utils/queues'
import { QueueEvents } from 'bullmq'
import { createError } from 'h3'

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const cToonId = '4a743220-bb5d-453e-be53-8b7644634689'

  // enqueue mint job
  const job = await mintQueue.add('mintCtoon', { userId, ctoonId: cToonId }, true)

  // wait for finish
  const qe = new QueueEvents(mintQueue.name, { connection: redisConnection })
  await qe.waitUntilReady()

  try {
    await job.waitUntilFinished(qe)
    return { success: true, ctoonId: cToonId }
  } catch (err) {
    // map errors as needed...
    throw createError({ statusCode: 500, statusMessage: err.message })
  } finally {
    await qe.close()
    await prisma.$disconnect()
  }
})
