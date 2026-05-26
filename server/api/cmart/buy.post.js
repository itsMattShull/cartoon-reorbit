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
      select: {
        id: true,
        inCmart: true,
        releaseDate: true,
        quantity: true,
        totalMinted: true,
        price: true,
        mintLimitType: true,
        mintEndDate: true
      }
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
      throw createError({ statusCode: 403, statusMessage: 'cToon not released yet.  Quit being a cheater.' })
    }

    const TIME_BASED_CAP = 999999999

    // Time-based mint window guard
    if (ctoon.mintLimitType === 'timeBased' && ctoon.mintEndDate) {
      if (new Date(ctoon.mintEndDate) <= now) {
        // After the minting window closes, allow clearance purchases as long as the
        // mint-end job has finalized the quantity (i.e., it's no longer the
        // TIME_BASED_CAP sentinel).  If the quantity is still TIME_BASED_CAP the
        // mint-end job hasn't run yet — block immediately.
        if (ctoon.quantity === TIME_BASED_CAP) {
          throw createError({ statusCode: 410, statusMessage: 'Minting period has ended.' })
        }
        // quantity is finalized — fall through to the normal sold-out check below
      }
    }

    const isUnlimited = ctoon.quantity === null
    const isTimeBased = ctoon.mintLimitType === 'timeBased'

    // Sold-out check — full quantity is always available at release (no two-phase gating)
    if (!isUnlimited && !(isTimeBased && ctoon.quantity === TIME_BASED_CAP)) {
      if (ctoon.totalMinted >= ctoon.quantity) {
        throw createError({ statusCode: 410, statusMessage: 'cToon already sold out.' })
      }
    }

    // — Resolve effective price (apply global half-price discount if active)
    let effectivePrice = ctoon.price
    try {
      const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { cmartHalfPriceEnabled: true } })
      if (cfg?.cmartHalfPriceEnabled === true) {
        effectivePrice = Math.floor(ctoon.price / 2)
      }
    } catch {}

    // — Verify available points (total - active locks)
    const [wallet, activeLocks] = await Promise.all([
      prisma.userPoints.findUnique({
        where: { userId },
        select: { points: true }
      }),
      prisma.lockedPoints.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { amount: true }
      })
    ])
    const totalPoints = wallet?.points ?? 0
    const lockedSum = activeLocks.reduce((acc, lock) => acc + (lock.amount || 0), 0)
    const availablePoints = totalPoints - lockedSum
    if (effectivePrice > availablePoints) {
      throw createError({ statusCode: 400, statusMessage: 'Not enough available points.' })
    }

    // — Enqueue the mint job
    const job = await mintQueue.add('mintCtoon', { userId, ctoonId, effectivePrice })

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

      if (/sold out/i.test(msg))                statusCode = 410
      else if (/minting period/i.test(msg))      statusCode = 410
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
