import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { scheduleAuctionClose, scheduleDissolveAuctionLaunch } from '../utils/queues.js'
import { isStaleDissolveLaunchJob } from '../utils/dissolveAuctionLaunchStaleness.js'
import { dissolveStartingBid } from '../utils/dissolveListing.js'
import { getDissolveScheduleConfig } from '../utils/dissolveSchedule.js'
import { logDissolveAuctionError } from '../utils/dissolveAuctionErrorLog.js'
import { recordPreventedMisfire } from '../utils/dissolveMisfire.js'

const QUEUE_NAME = process.env.DISSOLVE_AUCTION_LAUNCH_QUEUE_KEY || 'dissolveAuctionLaunch'
const OFFICIAL_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD?.trim() || undefined,
}

const worker = new Worker(QUEUE_NAME, async (job) => {
  const { queueEntryId, scheduledForMs } = job.data
  let entry = null

  try {
    const officialUser = await prisma.user.findUnique({
      where: { username: OFFICIAL_USERNAME },
      select: { id: true }
    })
    if (!officialUser) throw new Error('Official account not found')

    entry = await prisma.dissolveAuctionQueue.findUnique({
      where: { id: queueEntryId },
      include: {
        userCtoon: {
          select: {
            id: true,
            ctoonId: true,
            mintNumber: true,
            ctoon: { select: { name: true, rarity: true, series: true, set: true } }
          }
        }
      }
    })
    if (!entry) return  // already processed or deleted

    // This job's delay was already elapsing (BullMQ marked it `active`) at
    // the moment an admin rescheduled this entry, so scheduleDissolveAuctionLaunch
    // couldn't cancel/replace it (see its own comment) and this stale job is
    // still running against the OLD target time. Acting on it now would clear
    // or launch based on data the admin just changed. If the entry's current
    // scheduledFor no longer matches what this job was queued for, defer to
    // the new schedule instead: queue a fresh job for it (scheduleDissolveAuctionLaunch
    // no-ops only while a job is active, and this one is about to finish) and
    // do nothing else this run. scheduledForMs is undefined for jobs enqueued
    // before this check existed — those fall through to the old behavior.
    if (isStaleDissolveLaunchJob(scheduledForMs, entry.scheduledFor)) {
      if (entry.scheduledFor) {
        await scheduleDissolveAuctionLaunch(entry.id, entry.scheduledFor)
      }
      return
    }

    // Starting bid: the rarity floor, or for Auction/Prize/Code Only and Crazy Rare the bid an
    // admin set on the Dissolve Queue page (see server/utils/dissolveListing.js). Read fresh per
    // job so a bid set or cleared after scheduling is respected. No bid = held: clear scheduledFor
    // and stop. applyDissolveSchedule never gives a held entry a slot, so this no longer feeds the
    // old loop where these entries took the earliest slots, launched nothing, and repeated.
    const { startBids } = await getDissolveScheduleConfig()
    const startingBid = dissolveStartingBid(entry.userCtoon?.ctoon?.rarity, startBids)
    if (startingBid === null) {
      await prisma.dissolveAuctionQueue.update({
        where: { id: entry.id },
        data: { scheduledFor: null, pinnedAt: null }
      })
      return
    }

    const endAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.auction.findFirst({
        where: { userCtoonId: entry.userCtoonId, status: 'ACTIVE' },
        select: { id: true }
      })

      await tx.dissolveAuctionQueue.delete({ where: { id: entry.id } })

      if (existing) return null

      // This entry's own queued-at-dissolve-time ownership can go stale: an admin trade, a
      // second AuctionOnly listing, or any other path that moves the item out of the official
      // account's inventory doesn't know to clear this queue entry (see DissolveMisfireLog's own
      // schema comment). Re-verifying ownership here, inside the same transaction as the delete
      // above, is what actually closes the hole — whatever let the entry go stale upstream, this
      // is the one place that would otherwise auction off a real player's cToon out from under
      // them, so it's the one place that has to check.
      const currentOwner = await tx.userCtoon.findUnique({
        where: { id: entry.userCtoonId },
        select: { userId: true }
      })
      if (!currentOwner || currentOwner.userId !== officialUser.id) {
        return { misfirePrevented: true, rightfulOwnerUserId: currentOwner?.userId ?? null }
      }

      const created = await tx.auction.create({
        data: {
          userCtoonId: entry.userCtoonId,
          initialBet:  startingBid,
          duration:    1,
          durationMinutes: 1440,
          endAt,
          creatorId:   officialUser.id,
          isFeatured:  entry.isFeatured,
        },
        select: { id: true }
      })

      await tx.userCtoon.update({
        where: { id: entry.userCtoonId },
        data:  { isTradeable: false }
      })

      return { auctionId: created.id, endAt }
    })

    if (result?.misfirePrevented) {
      if (result.rightfulOwnerUserId) {
        await recordPreventedMisfire({
          userCtoonId: entry.userCtoonId,
          queueEntryId: entry.id,
          ctoonId: entry.userCtoon?.ctoonId ?? null,
          ctoonName: entry.userCtoon?.ctoon?.name ?? null,
          mintNumber: entry.userCtoon?.mintNumber ?? null,
          rightfulOwnerUserId: result.rightfulOwnerUserId,
        })
      }
    } else if (result) {
      await scheduleAuctionClose(result.auctionId, result.endAt)
    }
  } catch (err) {
    await logDissolveAuctionError(err, {
      queueEntryId,
      userCtoonId:    entry?.userCtoonId ?? entry?.userCtoon?.id ?? null,
      ctoonName:      entry?.userCtoon?.ctoon?.name ?? null,
      mintNumber:     entry?.userCtoon?.mintNumber ?? null,
      rarity:         entry?.userCtoon?.ctoon?.rarity ?? null,
      series:         entry?.userCtoon?.ctoon?.series ?? null,
      set:            entry?.userCtoon?.ctoon?.set ?? null,
      sourceUsername: entry?.sourceUsername ?? null,
    })
    throw err
  }
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`[dissolve-auction-launch] job ${job?.id} failed:`, err?.message || err)
})
