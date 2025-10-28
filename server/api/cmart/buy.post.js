// server/api/buy.post.js
import { prisma } from '@/server/prisma'
import { mintQueue } from '../../utils/queues'
import { QueueEvents } from 'bullmq'
import { createError } from 'h3'

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

export default defineEventHandler(async (event) => {
  let queueEvents
  try {
    // — Authentication
    const userId = event.context.userId
    if (!userId) {
      throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
    }

    // — Payload validation
    const { ctoonId } = await readBody(event)
    if (!ctoonId) {
      throw createError({ statusCode: 400, statusMessage: 'Missing ctoonId' })
    }

    // Fetch cToon for release check (and basic availability)
    const ctoon = await prisma.ctoon.findUnique({
      where: { id: ctoonId },
      select: { id: true, inCmart: true, releaseDate: true, quantity: true, totalMinted: true }
    })
    if (!ctoon || !ctoon.inCmart) {
      throw createError({ statusCode: 404, statusMessage: 'cToon not for sale, get hacked noob.' })
    }

    // Block if not yet released
    const now = new Date()
    if (ctoon.releaseDate && new Date(ctoon.releaseDate).getTime() > now.getTime()) {
      throw createError({ statusCode: 403, statusMessage: 'cToon not released yet, get hacked noob.' })
    }

    // Optional: sold-out fast check before queueing
    if (ctoon.quantity !== null && ctoon.totalMinted >= ctoon.quantity) {
      throw createError({ statusCode: 410, statusMessage: 'cToon already sold out :-(' })
    }

    // — (all your existing pre‐checks: fetch ctoon, sold-out, wallet, per-user limit, etc.)

    // — Enqueue the mint job
    const job = await mintQueue.add('mintCtoon', { userId, ctoonId })

    // — Set up a QueueEvents listener on the same queue
    queueEvents = new QueueEvents(mintQueue.name, { connection: redisConnection })
    await queueEvents.waitUntilReady()

    // — Wait until the worker either completes or fails this job
    try {
      await job.waitUntilFinished(queueEvents)

      // — Success!
      event.node.res.statusCode = 200
      return { success: true, message: 'cToon minted successfully' }

    } catch (err) {
      // — The worker threw an Error; map its message to an HTTP status
      const msg = err.message || 'Unknown error'
      let statusCode = 500

      if (/sold out/i.test(msg))          statusCode = 410
      else if (/insufficient points/i.test(msg)) statusCode = 400
      else if (/purchase limit/i.test(msg))      statusCode = 403
      else if (/not-for-sale/i.test(msg))        statusCode = 404

      throw createError({ statusCode, statusMessage: msg })
    }

  } finally {
    // — Clean up
    if (queueEvents) await queueEvents.close()
    await prisma.$disconnect()
  }
})
