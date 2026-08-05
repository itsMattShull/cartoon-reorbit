// server/utils/dissolveSchedule.js
// Shared scheduling logic for the DissolveAuctionQueue, used by both the admin
// "Reschedule All" endpoint and the automatic 9-month inactivity dissolve cron
// job. Assigns evenly-spaced `scheduledFor` times per category (FEATURED /
// OTHER), ordered priority-first (inactivity dissolves jump the queue ahead of
// admin-initiated dissolves), then by creation order.
import { prisma } from '../prisma.js'
import { scheduleDissolveAuctionLaunch, cancelDissolveAuctionLaunch } from './queues.js'

const CONFIG_ID = 'singleton'

// Persisted cadence defaults, read/written to GlobalGameConfig so the
// inactivity-dissolve cron can reuse whatever an admin last configured via
// the "Reschedule All" form on /admin/dissolve-queue.
export async function getDissolveScheduleConfig() {
  const config = await prisma.globalGameConfig.findUnique({
    where: { id: CONFIG_ID },
    select: {
      dissolveScheduleCadenceDays:        true,
      dissolveScheduleFeaturedPerCadence: true,
      dissolveScheduleOtherPerCadence:    true,
    }
  })
  return {
    cadenceDays:        config?.dissolveScheduleCadenceDays        ?? 7,
    featuredPerCadence: config?.dissolveScheduleFeaturedPerCadence ?? 2,
    otherPerCadence:    config?.dissolveScheduleOtherPerCadence    ?? 10,
  }
}

export async function saveDissolveScheduleConfig({ cadenceDays, featuredPerCadence, otherPerCadence }) {
  await prisma.globalGameConfig.upsert({
    where:  { id: CONFIG_ID },
    update: {
      dissolveScheduleCadenceDays:        Number(cadenceDays),
      dissolveScheduleFeaturedPerCadence: Number(featuredPerCadence),
      dissolveScheduleOtherPerCadence:    Number(otherPerCadence),
    },
    create: {
      id: CONFIG_ID,
      dissolveScheduleCadenceDays:        Number(cadenceDays),
      dissolveScheduleFeaturedPerCadence: Number(featuredPerCadence),
      dissolveScheduleOtherPerCadence:    Number(otherPerCadence),
    }
  })
}

/**
 * Assign scheduledFor times to DissolveAuctionQueue entries and schedule their
 * BullMQ launch jobs.
 * @param {object} opts
 * @param {Date|string} opts.startAtUtc
 * @param {number} opts.cadenceDays
 * @param {number} opts.featuredPerCadence
 * @param {number} opts.otherPerCadence
 * @param {boolean} [opts.reschedule] - if true, recompute every entry (not just unscheduled ones)
 * @returns {Promise<number>} number of entries scheduled
 */
export async function applyDissolveSchedule({ startAtUtc, cadenceDays, featuredPerCadence, otherPerCadence, reschedule = false }) {
  const startMs = new Date(startAtUtc).getTime()
  if (isNaN(startMs)) throw new Error('Invalid startAtUtc')

  const perCategory = {
    FEATURED: Number(featuredPerCadence) || 0,
    OTHER:    Number(otherPerCadence)    || 0,
  }

  const entries = await prisma.dissolveAuctionQueue.findMany({
    where: reschedule ? {} : { scheduledFor: null },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, category: true, scheduledFor: true }
  })
  if (!entries.length) return 0

  if (reschedule) {
    for (const e of entries) {
      if (e.scheduledFor) await cancelDissolveAuctionLaunch(e.id)
    }
  }

  const grouped = { FEATURED: [], OTHER: [] }
  for (const e of entries) grouped[e.category]?.push(e.id)

  let scheduled = 0
  for (const [cat, ids] of Object.entries(grouped)) {
    const countPerCadence = perCategory[cat]
    if (!countPerCadence || !ids.length) continue
    const intervalMs = (Number(cadenceDays) * 24 * 3600 * 1000) / countPerCadence

    for (let i = 0; i < ids.length; i++) {
      const scheduledFor = new Date(startMs + i * intervalMs)
      await prisma.dissolveAuctionQueue.update({
        where: { id: ids[i] },
        data:  { scheduledFor }
      })
      await scheduleDissolveAuctionLaunch(ids[i], scheduledFor)
      scheduled++
    }
  }

  return scheduled
}
