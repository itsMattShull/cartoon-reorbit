// server/workers/holiday-redeem.worker.js
//
// Owns the entire "open a Holiday Item" critical section: pick the weighted
// reward, lock (burn) the source cToon, mint the reward, record the
// redemption, patch the cZone layout, and delete the burned source.
//
// This used to all happen inline in server/api/holiday/redeem.post.js, which
// meant the whole thing lived and died with the HTTP request. If nuxt-server
// was reloaded/restarted (deploy, crash, `pm2 reload`) while a request was
// mid-flight — most likely while awaiting the mint job — the source cToon
// could be left burned (burnedAt set) with no reward ever recorded, and no
// way for the user to retry (the idempotency check only recognizes a
// completed HolidayRedemption row).
//
// Doing the work here instead means it runs on the separate, single-instance
// worker-holiday-redeem process, which isn't touched by a nuxt-server reload.
// If this worker process itself dies mid-job, BullMQ's stalled-job detection
// re-delivers the job once the worker comes back, and every step below is
// written to be safely repeatable so that re-delivery finishes the job
// instead of double-burning or double-minting.
import { Worker, QueueEvents } from 'bullmq'
import { prisma } from '../prisma.js'
import { mintQueue } from '../utils/queues.js'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const mintQueueEvents = new QueueEvents(mintQueue.name, { connection })

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

function normalizeZones(czoneRow, targetCount = 3) {
  const z = czoneRow?.layoutData
  if (
    z &&
    typeof z === 'object' &&
    Array.isArray(z.zones) &&
    z.zones.every((zz) => zz && typeof zz.background === 'string' && Array.isArray(zz.toons))
  ) {
    const zones = JSON.parse(JSON.stringify(z.zones))
    while (zones.length < targetCount) zones.push({ background: '', toons: [] })
    return zones
  }
  const single = Array.isArray(z) ? z : []
  const bg0 = typeof czoneRow?.background === 'string' ? czoneRow.background : ''
  const zones = [{ background: bg0, toons: JSON.parse(JSON.stringify(single)) }]
  while (zones.length < targetCount) zones.push({ background: '', toons: [] })
  return zones
}

function replaceBurnedInZones(zones, burnedUserCtoonId, reward, sourceCtoonId = null) {
  const applyReward = (item) => ({
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
  })

  let replaced = false
  const byUserCtoon = zones.map((zone) => {
    const toons = zone.toons.map((item) => {
      const itemUserCtoonId = item?.userCtoonId || item?.id
      if (itemUserCtoonId === burnedUserCtoonId) {
        replaced = true
        return applyReward(item)
      }
      return item
    })
    return { ...zone, toons }
  })

  if (replaced || !sourceCtoonId) return { zones: byUserCtoon, replaced }

  replaced = false
  const byCtoonId = byUserCtoon.map((zone) => {
    const toons = zone.toons.map((item) => {
      if (replaced) return item
      const itemCtoonId = item?.ctoonId || null
      const matchesLegacy = itemCtoonId === sourceCtoonId || item?.id === sourceCtoonId
      if (matchesLegacy) {
        replaced = true
        return applyReward(item)
      }
      return item
    })
    return { ...zone, toons }
  })

  return { zones: byCtoonId, replaced }
}

async function fetchRewardResponse(userId, resultCtoonId) {
  return prisma.userCtoon.findFirst({
    where: { userId, ctoonId: resultCtoonId },
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
}

function formatReward(rewardUC, resultCtoonId) {
  return rewardUC
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

// Patch the user's cZone layout and delete the burned source. Both steps are
// non-fatal (as they always were) — the redemption record is what makes the
// open "done"; a leftover burned row or stale zone entry can be cleaned up
// separately without ever risking a duplicate reward.
async function finishCosmetics(userId, userCtoonId, sourceCtoonId, rewardUC, resultCtoonId) {
  try {
    const czoneRow = await prisma.cZone.findFirst({ where: { userId } })
    if (czoneRow) {
      const [config, userRecord] = await Promise.all([
        prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { czoneCount: true } }),
        prisma.user.findUnique({ where: { id: userId }, select: { additionalCzones: true } })
      ])
      const baseCount = Number(config?.czoneCount ?? 3)
      const extraCount = Math.max(0, Number(userRecord?.additionalCzones ?? 0))
      let targetCount = Math.max(1, baseCount + extraCount)
      if (czoneRow.layoutData && typeof czoneRow.layoutData === 'object' && Array.isArray(czoneRow.layoutData.zones)) {
        targetCount = Math.max(targetCount, czoneRow.layoutData.zones.length)
      }
      const zones = normalizeZones(czoneRow, targetCount)
      const rewardPayload = formatReward(rewardUC, resultCtoonId)
      const { zones: updatedZones, replaced } = replaceBurnedInZones(zones, userCtoonId, rewardPayload, sourceCtoonId)
      if (replaced) {
        await prisma.cZone.upsert({
          where: { userId },
          update: { layoutData: { zones: updatedZones }, background: updatedZones[0]?.background || '' },
          create: { userId, layoutData: { zones: updatedZones }, background: updatedZones[0]?.background || '' }
        })
      }
    }
  } catch {}

  try {
    await prisma.userCtoon.delete({ where: { id: userCtoonId } })
  } catch {}
}

async function processHolidayRedeem(job) {
  const { userId, userCtoonId } = job.data

  // Already fully redeemed (either by an earlier attempt of this same job,
  // or by a previous request that raced this one) — return the recorded
  // result rather than doing anything again.
  const existingRedemption = await prisma.holidayRedemption.findFirst({
    where: { sourceUserCtoonId: userCtoonId },
    select: { resultCtoonId: true, event: { select: { id: true, name: true, minRevealAt: true } } }
  })
  if (existingRedemption) {
    const rewardUC = await fetchRewardResponse(userId, existingRedemption.resultCtoonId)
    return {
      success: true,
      message: 'cToon opened!',
      event: existingRedemption.event,
      reward: formatReward(rewardUC, existingRedemption.resultCtoonId)
    }
  }

  const source = await prisma.userCtoon.findUnique({
    where: { id: userCtoonId },
    select: { id: true, userId: true, burnedAt: true, ctoonId: true }
  })
  // Source is gone (already deleted by a prior, fully-finished attempt) with
  // no redemption row to show for it — nothing more this job can do.
  if (!source) {
    throw new Error('cToon not found')
  }

  const eventRec = await prisma.holidayEvent.findFirst({
    where: { items: { some: { ctoonId: source.ctoonId } } },
    orderBy: { startsAt: 'desc' },
    select: {
      id: true, name: true, minRevealAt: true,
      poolEntries: { select: { ctoonId: true, probabilityPercent: true } }
    }
  })
  if (!eventRec) throw new Error('This cToon is not a Holiday Item')

  if (eventRec.minRevealAt && new Date() < new Date(eventRec.minRevealAt)) {
    throw new Error('Too early to open this cToon')
  }

  // If the source isn't burned yet, lock it now. If it's already burned
  // (e.g. this job locked it on a previous attempt before the worker
  // restarted), just carry on from here — re-locking isn't needed and
  // re-checking `burnedAt: null` would make this step un-retryable.
  if (!source.burnedAt) {
    const lockRes = await prisma.userCtoon.updateMany({
      where: { id: userCtoonId, userId, burnedAt: null },
      data: { burnedAt: new Date(), isTradeable: false }
    })
    if (lockRes.count === 0) {
      // Someone else (a concurrent duplicate job — shouldn't happen given the
      // jobId dedup, but be defensive) already locked it. Re-check for a
      // finished redemption before giving up.
      const raced = await prisma.holidayRedemption.findFirst({
        where: { sourceUserCtoonId: userCtoonId },
        select: { resultCtoonId: true, event: { select: { id: true, name: true, minRevealAt: true } } }
      })
      if (raced) {
        const rewardUC = await fetchRewardResponse(userId, raced.resultCtoonId)
        return {
          success: true,
          message: 'cToon opened!',
          event: raced.event,
          reward: formatReward(rewardUC, raced.resultCtoonId)
        }
      }
      throw new Error('This cToon was already opened')
    }
  }

  if (!eventRec.poolEntries.length) throw new Error('Holiday event has no pool entries')

  const weightedPool = eventRec.poolEntries.map(r => ({ value: r.ctoonId, weight: r.probabilityPercent || 0 }))
  const chosen = pickWeighted(weightedPool)
  if (!chosen) throw new Error('No redeemable rewards available')
  const resultCtoonId = chosen.value

  const mintJob = await mintQueue.add('mintCtoon', {
    userId,
    ctoonId: resultCtoonId,
    isSpecial: true,
    bypassHolidayWindowCheck: true,
    method: 'HOLIDAY'
  })
  await mintQueueEvents.waitUntilReady()
  await mintJob.waitUntilFinished(mintQueueEvents)

  const rewardUC = await fetchRewardResponse(userId, resultCtoonId)

  // The unique constraint on sourceUserCtoonId is the real guard against a
  // double-redeem here (e.g. a retried job racing a still-running one) —
  // if another attempt already inserted this row, treat that as success
  // rather than erroring out a reward that was already minted.
  try {
    await prisma.holidayRedemption.create({
      data: { eventId: eventRec.id, userId, itemCtoonId: source.ctoonId, resultCtoonId, sourceUserCtoonId: userCtoonId }
    })
  } catch (err) {
    if (err?.code !== 'P2002') throw err
  }

  await finishCosmetics(userId, userCtoonId, source.ctoonId, rewardUC, resultCtoonId)

  return {
    success: true,
    message: 'cToon opened!',
    event: { id: eventRec.id, name: eventRec.name, minRevealAt: eventRec.minRevealAt },
    reward: formatReward(rewardUC, resultCtoonId)
  }
}

const worker = new Worker(
  process.env.HOLIDAY_REDEEM_QUEUE_KEY || 'holidayRedeemQueue',
  processHolidayRedeem,
  { connection }
)

worker.on('completed', () => {})
worker.on('failed', () => {})

export default worker
