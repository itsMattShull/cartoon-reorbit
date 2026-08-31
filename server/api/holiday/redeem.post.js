// server/api/holiday/redeem.post.js
//
// The actual burn+mint+record critical section runs in the persistent
// worker-holiday-redeem process (see server/workers/holiday-redeem.worker.js),
// not here. This handler only does read-only validation, enqueues the job
// (deduped by userCtoonId so a doubled click or a client retry can't start a
// second attempt), and waits for it to finish. If this request gets cut off
// (e.g. nuxt-server is reloaded mid-wait), the job keeps running on the
// worker regardless, and the client's retry will pick up the already-running
// or already-finished job through the same idempotent paths below.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { resolveUserCtoonId } from '../../utils/userCtoonId'
import { holidayRedeemQueue } from '../../utils/queues'
import { QueueEvents } from 'bullmq'

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

async function getIdempotentRedemptionResponse(userId, sourceUserCtoonId) {
  const redemption = await prisma.holidayRedemption.findFirst({
    where: { userId, sourceUserCtoonId },
    select: {
      resultCtoonId: true,
      event: { select: { id: true, name: true, minRevealAt: true } }
    }
  })
  if (!redemption) return null

  const rewardUC = await prisma.userCtoon.findFirst({
    where: { userId, ctoonId: redemption.resultCtoonId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      mintNumber: true,
      isFirstEdition: true,
      ctoon: {
        select: {
          id: true, name: true, rarity: true, series: true, set: true,
          assetPath: true, releaseDate: true, quantity: true
        }
      }
    }
  })

  return {
    success: true,
    message: 'cToon opened!',
    event: redemption.event
      ? { id: redemption.event.id, name: redemption.event.name, minRevealAt: redemption.event.minRevealAt }
      : null,
    reward: rewardUC
      ? {
          userCtoonId: rewardUC.id,
          id: rewardUC.ctoon.id,
          name: rewardUC.ctoon.name,
          rarity: rewardUC.ctoon.rarity,
          series: rewardUC.ctoon.series,
          set: rewardUC.ctoon.set,
          assetPath: rewardUC.ctoon.assetPath,
          releaseDate: rewardUC.ctoon.releaseDate,
          quantity: rewardUC.ctoon.quantity,
          isFirstEdition: rewardUC.isFirstEdition,
          mintNumber: rewardUC.mintNumber
        }
      : { userCtoonId: null, id: redemption.resultCtoonId }
  }
}

export default defineEventHandler(async (event) => {
  let queueEvents
  try {
    const userId = event.context.userId
    if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    const { userCtoonId: rawUserCtoonId } = await readBody(event)
    if (!rawUserCtoonId) {
      throw createError({ statusCode: 400, statusMessage: 'Missing userCtoonId' })
    }
    const userCtoonId = await resolveUserCtoonId(rawUserCtoonId)
    if (!userCtoonId) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid cToon reference' })
    }

    // Fast path: already fully redeemed.
    const idempotentResponse = await getIdempotentRedemptionResponse(userId, userCtoonId)
    if (idempotentResponse) return idempotentResponse

    // If a job for this cToon is already running (this is a retry of a
    // request that got cut off, or a doubled click), just wait on it instead
    // of re-validating and enqueueing a duplicate.
    let job = await holidayRedeemQueue.getJob(userCtoonId)

    if (!job) {
      const source = await prisma.userCtoon.findUnique({
        where: { id: userCtoonId },
        select: { id: true, userId: true, burnedAt: true, ctoonId: true }
      })
      if (!source || source.userId !== userId) {
        throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
      }
      // A burned source with no redemption row and no running job is the
      // stuck state this rework is meant to prevent going forward; it can
      // still exist as leftover from before this fix. Enqueueing here is
      // safe — the worker resumes from `burnedAt` already set rather than
      // re-checking it — so it picks the redemption back up instead of
      // leaving the user stuck.

      const [pendingOffer, activeAuction] = await Promise.all([
        prisma.tradeOffer.findFirst({
          where: { status: 'PENDING', ctoons: { some: { userCtoonId } } },
          select: { id: true }
        }),
        prisma.auction.findFirst({
          where: { userCtoonId, status: 'ACTIVE' },
          select: { id: true }
        })
      ])
      if (pendingOffer || activeAuction) {
        const reasons = []
        if (pendingOffer) reasons.push('a pending trade offer')
        if (activeAuction) reasons.push('an active auction')
        throw createError({
          statusCode: 409,
          statusMessage: `Cannot open this cToon while it is part of ${reasons.join(' and ')}.`
        })
      }

      const eventRec = await prisma.holidayEvent.findFirst({
        where: { items: { some: { ctoonId: source.ctoonId } } },
        orderBy: { startsAt: 'desc' },
        select: { minRevealAt: true }
      })
      if (!eventRec) {
        throw createError({ statusCode: 400, statusMessage: 'This cToon is not a Holiday Item' })
      }
      if (eventRec.minRevealAt && new Date() < new Date(eventRec.minRevealAt)) {
        throw createError({ statusCode: 403, statusMessage: 'Too early to open this cToon' })
      }

      job = await holidayRedeemQueue.add(
        'redeem',
        { userId, userCtoonId },
        { jobId: userCtoonId }
      )
    }

    queueEvents = new QueueEvents(holidayRedeemQueue.name, { connection: redisConnection })
    await queueEvents.waitUntilReady()

    try {
      return await job.waitUntilFinished(queueEvents, 30_000)
    } catch (err) {
      const msg = err?.message || 'Redemption failed'
      // The job may since have finished (its result just missed the timeout
      // window above) — check for a completed redemption before surfacing
      // an error the client would otherwise wrongly treat as "nothing
      // happened, safe to retry from scratch".
      const settledResponse = await getIdempotentRedemptionResponse(userId, userCtoonId)
      if (settledResponse) return settledResponse
      let statusCode = 500
      if (/sold out/i.test(msg)) statusCode = 410
      if (/already opened|Too early|not a Holiday Item|no pool entries|no redeemable/i.test(msg)) statusCode = 409
      throw createError({ statusCode, statusMessage: msg })
    }
  } finally {
    if (queueEvents) await queueEvents.close()
  }
})
