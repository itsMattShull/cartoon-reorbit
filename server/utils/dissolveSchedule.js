// server/utils/dissolveSchedule.js
// Shared scheduling logic for the DissolveAuctionQueue, used by both the admin
// "Reschedule All" endpoint and the automatic 9-month inactivity dissolve cron
// job. Assigns evenly-spaced `scheduledFor` times per category (FEATURED /
// OTHER), ordered priority-first (inactivity dissolves jump the queue ahead of
// admin-initiated dissolves), then by creation order.
import { prisma } from '../prisma.js'
import { scheduleDissolveAuctionLaunch, cancelDissolveAuctionLaunch, dissolveAuctionLaunchQueue } from './queues.js'
import { SPECIAL_RARITY_BID_FIELDS, isDissolveListable, pickOverdueLaunches } from './dissolveListing.js'

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
      ...Object.fromEntries(Object.values(SPECIAL_RARITY_BID_FIELDS).map(f => [f, true])),
    }
  })
  return {
    cadenceDays:        config?.dissolveScheduleCadenceDays        ?? 7,
    featuredPerCadence: config?.dissolveScheduleFeaturedPerCadence ?? 2,
    otherPerCadence:    config?.dissolveScheduleOtherPerCadence    ?? 10,
    // Starting bids for the special rarities (see dissolveListing.js); null = held.
    startBids: Object.fromEntries(Object.values(SPECIAL_RARITY_BID_FIELDS).map(f => [f, config?.[f] ?? null])),
  }
}

// `data` comes from parseStartBidsInput (dissolveListing.js) — already validated.
export async function saveDissolveStartBids(data) {
  await prisma.globalGameConfig.upsert({
    where:  { id: CONFIG_ID },
    update: data,
    create: { id: CONFIG_ID, ...data },
  })
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
 * @param {boolean} [opts.includePinned] - if true (and reschedule is true), also recompute
 *   entries a mod manually rescheduled (pinnedAt set), clearing their pin in the process.
 *   Ignored when reschedule is false, since unscheduled entries are never pinned.
 * Entries that can't auto-list right now (a special rarity with no starting bid set — see
 * dissolveListing.js) are HELD: they never get a slot, and any old schedule they had is cleared.
 * Before this, they were given the earliest slots, launched nothing, reset to unscheduled, and got
 * the earliest slots again on the next run — so a queue full of them auctioned nothing.
 * @returns {Promise<number>} number of entries scheduled
 */
export async function applyDissolveSchedule({ startAtUtc, cadenceDays, featuredPerCadence, otherPerCadence, reschedule = false, includePinned = false }) {
  const startMs = new Date(startAtUtc).getTime()
  if (isNaN(startMs)) throw new Error('Invalid startAtUtc')

  const perCategory = {
    FEATURED: Number(featuredPerCadence) || 0,
    OTHER:    Number(otherPerCadence)    || 0,
  }

  const where = reschedule
    ? (includePinned ? {} : { pinnedAt: null })
    : { scheduledFor: null }

  const { startBids } = await getDissolveScheduleConfig()

  const all = await prisma.dissolveAuctionQueue.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, category: true, scheduledFor: true, pinnedAt: true, userCtoon: { select: { ctoon: { select: { rarity: true } } } } }
  })
  if (!all.length) return 0

  const entries = []
  for (const e of all) {
    if (isDissolveListable(e.userCtoon?.ctoon?.rarity, startBids)) { entries.push(e); continue }
    // Held. Pull it off any old schedule so it doesn't sit there as a job that will never list.
    if (e.scheduledFor) {
      await cancelDissolveAuctionLaunch(e.id)
      await prisma.dissolveAuctionQueue.update({ where: { id: e.id }, data: { scheduledFor: null, pinnedAt: null } })
    }
  }
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
        // Any entry swept up by the auto-scheduler is auto-managed going
        // forward, so clear its pin (a no-op for entries that weren't pinned).
        data:  { scheduledFor, pinnedAt: null }
      })
      await scheduleDissolveAuctionLaunch(ids[i], scheduledFor)
      scheduled++
    }
  }

  return scheduled
}

/**
 * Recovery sweep (cron: requeueOverdueDissolveLaunches). Launches are BullMQ delayed jobs; an entry
 * whose job is gone (Redis restart without persistence, a one-off failure, a stale-job deferral
 * that couldn't re-add itself) stays "scheduled" in the past forever otherwise — Apply Schedule
 * never touches already-scheduled entries. See pickOverdueLaunches in dissolveListing.js for the
 * per-job-state rules. Bounded per run (maxScan / maxRequeue) so a large backlog drains over
 * several runs.
 * @returns {Promise<number>} entries requeued
 */
export async function requeueOverdueDissolveLaunches({ maxScan = 2000, maxRequeue = 200 } = {}) {
  const now = Date.now()
  const cutoff = new Date(now - 5 * 60 * 1000)
  const PAGE = 200
  let requeued = 0
  let scanned = 0
  let cursor = null
  // Page through EVERY past-due entry (bounded by maxScan), not just the oldest 200: if the oldest
  // ones are legitimately waiting/delayed (worker down) or recently failed, later entries with a
  // lost job must still be found.
  while (scanned < maxScan && requeued < maxRequeue) {
    const page = await prisma.dissolveAuctionQueue.findMany({
      where: { scheduledFor: { not: null, lte: cutoff } },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, scheduledFor: true },
    })
    if (!page.length) break
    scanned += page.length
    cursor = page[page.length - 1].id

    const jobs = new Map()
    for (const e of page) {
      const job = await dissolveAuctionLaunchQueue.getJob(e.id)
      if (job) jobs.set(e.id, { state: await job.getState(), finishedOn: job.finishedOn || null })
    }
    // A persistently failing entry is retried every 6h, not every run (it's also in the Errors log).
    for (const id of pickOverdueLaunches(page, jobs, { now, retryMs: 6 * 60 * 60 * 1000 })) {
      if (requeued >= maxRequeue) break
      // Re-read right before acting: an admin may have rescheduled it since the page was read.
      // Requeueing with the stale time would replace their fresh job with an immediate one.
      const fresh = await prisma.dissolveAuctionQueue.findUnique({ where: { id }, select: { scheduledFor: true } })
      if (!fresh?.scheduledFor || new Date(fresh.scheduledFor).getTime() > cutoff.getTime()) continue
      await scheduleDissolveAuctionLaunch(id, fresh.scheduledFor)
      requeued++
    }
    if (page.length < PAGE) break
  }
  if (requeued) console.log(`[requeueOverdueDissolveLaunches] requeued ${requeued} overdue dissolve launch(es)`)
  return requeued
}
