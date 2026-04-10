import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { scheduleAuctionClose } from '../utils/queues.js'

const QUEUE_NAME = process.env.DISSOLVE_AUCTION_LAUNCH_QUEUE_KEY || 'dissolveAuctionLaunch'
const OFFICIAL_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD?.trim() || undefined,
}

function rarityFloor(r) {
  const s = (r || '').trim().toLowerCase()
  if (s === 'common')     return 25
  if (s === 'uncommon')   return 50
  if (s === 'rare')       return 100
  if (s === 'very rare')  return 187
  if (s === 'crazy rare') return 312
  return 50
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
