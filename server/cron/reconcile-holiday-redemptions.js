// server/cron/reconcile-holiday-redemptions.js
//
// Safety net for the Holiday Item open flow (server/api/holiday/redeem.post.js,
// server/workers/holiday-redeem.worker.js). The normal path locks (burns) the
// source cToon and always finishes through the persistent holiday-redeem
// worker, so a stuck burn shouldn't happen going forward. This cron catches
// the case where it does anyway (e.g. Redis data loss wiped the job) by
// unlocking a burned Holiday Item that has no recorded redemption and no
// holiday-redeem job in flight for it, so the user can simply try opening it
// again instead of being stuck forever.
import { prisma } from '../prisma.js'
import { holidayRedeemQueue } from '../utils/queues.js'

const STUCK_AFTER_MS = 10 * 60 * 1000 // give an in-flight open plenty of time to finish first

const IN_FLIGHT_STATES = new Set(['active', 'waiting', 'delayed', 'waiting-children', 'prioritized'])

export async function reconcileHolidayRedemptions() {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS)

  const stuck = await prisma.userCtoon.findMany({
    where: {
      burnedAt: { not: null, lte: cutoff },
      ctoon: { holidayItems: { some: {} } }
    },
    select: { id: true, burnedAt: true }
  })
  if (!stuck.length) return

  for (const row of stuck) {
    const redemption = await prisma.holidayRedemption.findFirst({
      where: { sourceUserCtoonId: row.id },
      select: { id: true }
    })
    if (redemption) continue // finished; a leftover burned row here just means cleanup didn't run, which is harmless

    const job = await holidayRedeemQueue.getJob(row.id)
    if (job) {
      const state = await job.getState()
      if (IN_FLIGHT_STATES.has(state)) continue
      // A failed/unknown job with no redemption row: clear it so the next
      // open attempt enqueues a fresh one instead of reusing a dead job id.
      try { await job.remove() } catch {}
    }

    await prisma.userCtoon.updateMany({
      where: { id: row.id, burnedAt: row.burnedAt },
      data: { burnedAt: null, isTradeable: true }
    })
  }
}
