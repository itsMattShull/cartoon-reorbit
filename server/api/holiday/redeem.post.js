// server/api/holiday/redeem.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { mintQueue } from '../../utils/queues'
import { QueueEvents } from 'bullmq'

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

// helper: pick 1 item from [{ value, weight }]
function pickWeighted(items) {
  const total = items.reduce((s, it) => s + Math.max(0, it.weight || 0), 0)
  if (total <= 0) return null
  const r = Math.random() * total
  let acc = 0
  for (const it of items) {
    acc += Math.max(0, it.weight || 0)
    if (r < acc) return it
  }
  return items[items.length - 1] || null
}

// helper: normalize any legacy/single-zone layout into { zones: [ {background,toons:[]} x3 ] }
function normalizeZones(czoneRow) {
  const z = czoneRow?.layoutData
  // new shape already
  if (
    z &&
    typeof z === 'object' &&
    Array.isArray(z.zones) &&
    z.zones.length === 3 &&
    z.zones.every((zz) => zz && typeof zz.background === 'string' && Array.isArray(zz.toons))
  ) {
    // deep clone to avoid mutating Prisma's cached object
    return JSON.parse(JSON.stringify(z.zones))
  }

  // legacy single-zone array in layoutData
  const single = Array.isArray(z) ? z : []
  const bg0 = typeof czoneRow?.background === 'string' ? czoneRow.background : ''

  return [
    { background: bg0, toons: JSON.parse(JSON.stringify(single)) },
    { background: '',  toons: [] },
    { background: '',  toons: [] }
  ]
}

// helper: replace the burned userCtoon in zones with the rewarded one; returns { zones, replaced }
function replaceBurnedInZones(zones, burnedUserCtoonId, reward) {
  let replaced = false
  const next = zones.map((zone) => {
    const toons = zone.toons.map((item) => {
      const itemUserCtoonId = item?.userCtoonId || item?.id
      if (itemUserCtoonId === burnedUserCtoonId) {
        replaced = true
        // Keep layout props and overwrite identity/metadata
        return {
          ...item,
          id: reward.userCtoonId,
          userCtoonId: reward.userCtoonId,
          ctoonId: reward.id,
          name: reward.name,
          series: reward.series,
          rarity: reward.rarity,
          set: reward.set ?? item.set,
          releaseDate: reward.releaseDate ?? item.releaseDate,
          quantity: reward.quantity ?? item.quantity,
          assetPath: reward.assetPath,
          isFirstEdition: reward.isFirstEdition ?? item.isFirstEdition,
          mintNumber: reward.mintNumber ?? item.mintNumber
        }
      }
      return item
    })
    return { ...zone, toons }
  })
  return { zones: next, replaced }
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
          id: true,
          name: true,
          rarity: true,
          series: true,
          set: true,
          assetPath: true,
          releaseDate: true,
          quantity: true
        }
      }
    }
  })

  return {
    success: true,
    message: 'cToon opened!',
    event: redemption.event
      ? {
          id: redemption.event.id,
          name: redemption.event.name,
          minRevealAt: redemption.event.minRevealAt
        }
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
    // ── Auth ───────────────────────────────────────────────────────────────
    const userId = event.context.userId
    if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

    // ── Input ─────────────────────────────────────────────────────────────
    const { userCtoonId } = await readBody(event)
    if (!userCtoonId) {
      throw createError({ statusCode: 400, statusMessage: 'Missing userCtoonId' })
    }

    const idempotentResponse = await getIdempotentRedemptionResponse(userId, userCtoonId)
    if (idempotentResponse) return idempotentResponse

    // Load the owned, not-yet-burned UserCtoon (the Holiday Item)
    const source = await prisma.userCtoon.findUnique({
      where: { id: userCtoonId },
      select: {
        id: true, userId: true, burnedAt: true, ctoonId: true,
        ctoon: { select: { id: true, name: true } }
      }
    })
    if (!source || source.userId !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'cToon not found' })
    }
    if (source.burnedAt) {
      const burnedResponse = await getIdempotentRedemptionResponse(userId, userCtoonId)
      if (burnedResponse) return burnedResponse
      throw createError({ statusCode: 409, statusMessage: 'This cToon is already opened/burned' })
    }

    // ── Guards: block if in pending trade offer or active auction ──────────
    const [pendingOffer, activeAuction] = await Promise.all([
      prisma.tradeOffer.findFirst({
        where: {
          status: 'PENDING',
          ctoons: { some: { userCtoonId } } // any role (OFFERED or REQUESTED)
        },
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

    // Find latest HolidayEvent that includes this item cToon
    const eventRec = await prisma.holidayEvent.findFirst({
      where: { items: { some: { ctoonId: source.ctoonId } } },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true, name: true, minRevealAt: true,
        poolEntries: { select: { ctoonId: true, probabilityPercent: true } }
      }
    })
    if (!eventRec) {
      throw createError({ statusCode: 400, statusMessage: 'This cToon is not a Holiday Item' })
    }

    // Enforce minRevealAt ONLY
    const now = new Date()
    if (eventRec.minRevealAt && now < new Date(eventRec.minRevealAt)) {
      throw createError({ statusCode: 403, statusMessage: 'Too early to open this cToon' })
    }

    if (!eventRec.poolEntries.length) {
      throw createError({ statusCode: 409, statusMessage: 'Holiday event has no pool entries' })
    }

    // Weighted pick a result cToon
    const weightedPool = eventRec.poolEntries.map(r => ({
      value: r.ctoonId,
      weight: r.probabilityPercent || 0
    }))
    const chosen = pickWeighted(weightedPool)
    if (!chosen) {
      throw createError({ statusCode: 409, statusMessage: 'No redeemable rewards available' })
    }
    const resultCtoonId = chosen.value

    // Soft-lock the source (so we can safely wait for async mint)
    const lockRes = await prisma.userCtoon.updateMany({
      where: { id: userCtoonId, userId, burnedAt: null },
      data:  { burnedAt: now, isTradeable: false }
    })
    if (lockRes.count === 0) {
      const lockedResponse = await getIdempotentRedemptionResponse(userId, userCtoonId)
      if (lockedResponse) return lockedResponse
      throw createError({ statusCode: 409, statusMessage: 'This cToon was already opened' })
    }

    // Enqueue the mint job for the RESULT cToon (free, bypass checks)
    const job = await mintQueue.add('mintCtoon', {
      userId,
      ctoonId: resultCtoonId,
      isSpecial: true,
      bypassHolidayWindowCheck: true
    })

    // Wait for worker to finish
    queueEvents = new QueueEvents(mintQueue.name, { connection: redisConnection })
    await queueEvents.waitUntilReady()

    try {
      await job.waitUntilFinished(queueEvents)
    } catch (err) {
      // Undo the lock if mint failed
      await prisma.userCtoon.updateMany({
        where: { id: userCtoonId, userId },
        data:  { burnedAt: null, isTradeable: true }
      })
      const msg = err?.message || 'Redemption mint failed'
      let statusCode = 500
      if (/sold out/i.test(msg)) statusCode = 410
      throw createError({ statusCode, statusMessage: msg })
    }

    // Get the most recently minted UserCtoon for THIS reward and THIS user
    const rewardUC = await prisma.userCtoon.findFirst({
      where: { userId, ctoonId: resultCtoonId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        mintNumber: true,
        isFirstEdition: true,
        ctoon: {
          select: {
            id: true,
            name: true,
            rarity: true,
            series: true,
            set: true,
            assetPath: true,
            releaseDate: true,
            quantity: true
          }
        }
      }
    })

    // Record the redemption
    await prisma.holidayRedemption.create({
      data: {
        eventId: eventRec.id,
        userId,
        itemCtoonId: source.ctoonId,
        resultCtoonId,
        sourceUserCtoonId: userCtoonId
      }
    })

    // Update the user's cZone layout
    try {
      const czoneRow = await prisma.cZone.findFirst({ where: { userId } })
      if (czoneRow) {
        const zones = normalizeZones(czoneRow)

        const rewardPayload = rewardUC
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
          : {
              userCtoonId: null,
              id: resultCtoonId
            }

        const { zones: updatedZones, replaced } = replaceBurnedInZones(
          zones,
          userCtoonId,
          rewardPayload
        )

        if (replaced) {
          await prisma.cZone.upsert({
            where: { userId },
            update: {
              layoutData: { zones: updatedZones },
              background: updatedZones[0]?.background || ''
            },
            create: {
              userId,
              layoutData: { zones: updatedZones },
              background: updatedZones[0]?.background || ''
            }
          })
        }
      }
    } catch (e) {
      // Non-fatal
    }

    // Try to delete the source UserCtoon
    try {
      await prisma.userCtoon.delete({ where: { id: userCtoonId } })
    } catch (e) {
      // Leave as burned/locked
    }

    // Response
    return {
      success: true,
      message: 'cToon opened!',
      event: { id: eventRec.id, name: eventRec.name, minRevealAt: eventRec.minRevealAt },
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
        : { userCtoonId: null, id: resultCtoonId }
    }

  } finally {
    if (queueEvents) await queueEvents.close()
  }
})
