// server/api/buy.post.js
import { prisma } from '@/server/prisma'
import { mintQueue } from '../../utils/queues'
import { QueueEvents } from 'bullmq'
import { createError, readBody } from 'h3'

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

    // Allow if in cMart OR part of an active holiday event
    const now = new Date()
    const activeHolidayItem = await prisma.holidayEventItem.findFirst({
      where: {
        ctoonId,
        event: {
          isActive: true,
          startsAt: { lte: now },
          endsAt:   { gte: now }
        }
      }
    })

    if (!ctoon || (!ctoon.inCmart && !activeHolidayItem)) {
      throw createError({ statusCode: 404, statusMessage: 'cToon not for sale, get hacked noob.' })
    }

    // Release window gating (two-phase)
    if (ctoon.releaseDate && new Date(ctoon.releaseDate).getTime() > now.getTime()) {
      throw createError({ statusCode: 403, statusMessage: 'cToon not released yet.' })
    }

    const isUnlimited = ctoon.quantity === null
    if (!isUnlimited) {
      // Load global settings
      let initialPercent = 75
      let delayHours = 12
      try {
        const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
        if (cfg) {
          if (typeof cfg.initialReleasePercent === 'number') initialPercent = cfg.initialReleasePercent
          if (typeof cfg.finalReleaseDelayHours === 'number') delayHours = cfg.finalReleaseDelayHours
        }
      } catch {}

      const qty = Number(ctoon.quantity)
      const initialCap = Math.max(1, Math.floor((qty * Number(initialPercent)) / 100))
      const finalReleaseAt = ctoon.releaseDate
        ? new Date(new Date(ctoon.releaseDate).getTime() + delayHours * 60 * 60 * 1000)
        : null

      const beforeFinal = finalReleaseAt ? now < finalReleaseAt : false
      const allowedCap = beforeFinal ? initialCap : qty

      // Optional: sold-out fast check before queueing (window-aware)
      if (ctoon.totalMinted >= allowedCap) {
        const msg = beforeFinal
          ? 'Initial window sold out. Please wait for the final release.'
          : 'cToon already sold out.'
        throw createError({ statusCode: 410, statusMessage: msg })
      }
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
  }
})
