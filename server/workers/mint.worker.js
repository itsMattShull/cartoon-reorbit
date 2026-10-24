import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { processMintJob } from '../utils/mintCtoon.js'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

// Create a BullMQ worker to process mint jobs
const worker = new Worker(process.env.MINT_QUEUE_KEY, job => processMintJob(job, prisma), { connection })

// Optional: logging
worker.on('completed', job => {
  // console.log(`Mint job ${job.id} completed`)
})
worker.on('failed', (job, err) => {
  // console.error(`Mint job ${job?.id} failed: ${err.message}`)
})

export default worker
