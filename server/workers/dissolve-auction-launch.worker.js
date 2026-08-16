import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { scheduleAuctionClose } from '../utils/queues.js'
import { rarityFloor } from '../utils/auctionPriceSuggestion.js'
import { isAutoAuctionEligibleRarity } from '../utils/autoAuctionEligibility.js'
import { logDissolveAuctionError } from '../utils/dissolveAuctionErrorLog.js'

const QUEUE_NAME = process.env.DISSOLVE_AUCTION_LAUNCH_QUEUE_KEY || 'dissolveAuctionLaunch'
const OFFICIAL_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD?.trim() || undefined,
}

const worker = new Worker(QUEUE_NAME, async (job) => {
  const { queueEntryId } = job.data
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
            mintNumber: true,
            ctoon: { select: { name: true, rarity: true, series: true, set: true } }
          }
        }
      }
    })
    if (!entry) return  // already processed or deleted

    // Not auto-listable (Auction/Prize/Code Only, Crazy Rare, or an
    // unrecognized rarity with no explicit floor). Clear scheduledFor instead
    // of leaving the entry stranded with no job: the next applyDissolveSchedule
    // run picks up any entry with scheduledFor: null and re-queues it.
    if (!isAutoAuctionEligibleRarity(entry.userCtoon?.ctoon?.rarity)) {
      await prisma.dissolveAuctionQueue.update({
        where: { id: entry.id },
        data: { scheduledFor: null }
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

      const created = await tx.auction.create({
        data: {
          userCtoonId: entry.userCtoonId,
          initialBet:  rarityFloor(entry.userCtoon?.ctoon?.rarity),
          duration:    1,
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

    if (result) {
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
