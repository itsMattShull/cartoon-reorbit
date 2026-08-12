import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { scheduleAuctionClose } from '../utils/queues.js'
import { rarityFloor } from '../utils/auctionPriceSuggestion.js'
import { isAutoAuctionEligibleRarity } from '../utils/autoAuctionEligibility.js'

const QUEUE_NAME = process.env.DISSOLVE_AUCTION_LAUNCH_QUEUE_KEY || 'dissolveAuctionLaunch'
const OFFICIAL_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD?.trim() || undefined,
}

new Worker(QUEUE_NAME, async (job) => {
  const { queueEntryId } = job.data

  const officialUser = await prisma.user.findUnique({
    where: { username: OFFICIAL_USERNAME },
    select: { id: true }
  })
  if (!officialUser) throw new Error('Official account not found')

  const entry = await prisma.dissolveAuctionQueue.findUnique({
    where: { id: queueEntryId },
    include: {
      userCtoon: { select: { id: true, ctoon: { select: { rarity: true } } } }
    }
  })
  if (!entry) return  // already processed or deleted

  // This launch prices from the rarity floor, so a rarity with no real floor
  // would go up at the 50 pt fallback. Deliberate-release rarities need an admin
  // to set a price instead of being launched automatically.
  //
  // Clearing scheduledFor (rather than deleting the entry, or leaving it with a
  // past scheduledFor and no BullMQ job) is what keeps it visible and
  // recoverable: applyDissolveSchedule picks up entries WHERE scheduledFor IS
  // NULL, so the next "Reschedule All" re-queues it, and until then it shows as
  // unscheduled on /admin/dissolve-queue.
  if (!isAutoAuctionEligibleRarity(entry.userCtoon?.ctoon?.rarity)) {
    await prisma.dissolveAuctionQueue.update({
      where: { id: entry.id },
      data:  { scheduledFor: null }
    })
    console.warn(
      `[dissolve-auction-launch] skipped queue entry ${entry.id}: rarity ` +
      `"${entry.userCtoon?.ctoon?.rarity ?? 'none'}" is not auto-auctionable. ` +
      `Left unscheduled for an admin to price and launch manually.`
    )
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
}, { connection })
