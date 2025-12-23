import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

// Create a BullMQ worker to process mint jobs
const worker = new Worker(process.env.MINT_QUEUE_KEY, async job => {
    const { userId, ctoonId, isSpecial = false } = job.data

    // Fetch cToon details
    const ctoon = await prisma.ctoon.findUnique({ where: { id: ctoonId } })
    if (!ctoon) throw new Error('Invalid or not-for-sale cToon')

    // ───────────────────────── Holiday window guard ─────────────────────────
    // If this cToon is a Holiday Item in ANY event, only allow mint while an
    // associated event is active (isActive && startsAt <= now < endsAt).
    const now = new Date()

    // Is this cToon used as a Holiday Item anywhere?
    const holidayLinkCount = await prisma.holidayEventItem.count({
      where: { ctoonId }
    })

    if (holidayLinkCount > 0) {
      // Is there an active event (right now) that includes this cToon?
      const activeEvent = await prisma.holidayEvent.findFirst({
        where: {
          isActive: true,
          startsAt: { lte: now },
          endsAt:   { gt:  now },
          items: { some: { ctoonId } }
        },
        select: { id: true }
      })

      if (!activeEvent) {
        throw new Error('This Holiday Item can only be minted while its event is active.')
      }
    }

    // Count existing user purchases for limit checks
    const existing = await prisma.userCtoon.findMany({ where: { userId, ctoonId } })

    // Wallet balance check
    const wallet = await prisma.userPoints.findUnique({ where: { userId } })
    if (!isSpecial && (!wallet || wallet.points < ctoon.price)) {
      throw new Error('Insufficient points')
    }

    // Per-user limit enforcement (first 48h window)
    if (!isSpecial && ctoon.releaseDate) {
      const hoursSinceRelease =
        (Date.now() - new Date(ctoon.releaseDate).getTime()) / (1000 * 60 * 60)
      const enforceLimit = hoursSinceRelease < 48
      if (
        enforceLimit &&
        ctoon.perUserLimit !== null &&
        existing.length >= ctoon.perUserLimit
      ) {
        throw new Error(
          `Purchase limit of ${ctoon.perUserLimit} within first 48h reached`
        )
      }
    } else if (!isSpecial && ctoon.perUserLimit !== null && existing.length >= ctoon.perUserLimit) {
      // Fallback if no releaseDate
      throw new Error(`Purchase limit of ${ctoon.perUserLimit} reached`)
    }

    // Load global settings (for window-aware caps)
    let initialPercent = 75
    let delayHours = 12
    try {
      const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
      if (cfg) {
        if (typeof cfg.initialReleasePercent === 'number') initialPercent = cfg.initialReleasePercent
        if (typeof cfg.finalReleaseDelayHours === 'number') delayHours = cfg.finalReleaseDelayHours
      }
    } catch {}

    // Mint inside a single transaction with atomic counter for mintNumber
    await prisma.$transaction(async (tx) => {
      // 1) Atomically increment totalMinted and use the new value as mintNumber
      const updatedCtoon = await tx.ctoon.update({
        where: { id: ctoonId },
        data: { totalMinted: { increment: 1 } },
        select: { totalMinted: true, initialQuantity: true, quantity: true, releaseDate: true }
      })

      const mintNumber = updatedCtoon.totalMinted
      // Sold-out guard (rolls back the increment if exceeded)
      if (updatedCtoon.quantity !== null && mintNumber > updatedCtoon.quantity) {
        throw new Error('cToon sold out')
      }

      // Window-aware cap (non-special mints only)
      if (!isSpecial && updatedCtoon.quantity !== null && ctoon.releaseDate) {
        const qty = Number(updatedCtoon.quantity)
        const initialCap = Math.max(1, Math.floor((qty * Number(initialPercent)) / 100))
        const finalReleaseAt = new Date(new Date(ctoon.releaseDate).getTime() + delayHours * 60 * 60 * 1000)
        const now = new Date()
        const beforeFinal = now < finalReleaseAt
        const allowedCap = beforeFinal ? initialCap : qty
        if (mintNumber > allowedCap) {
          throw new Error('Initial window sold out. Please wait for the final release.')
        }
      }

      const isFirstEdition =
        updatedCtoon.initialQuantity === null || mintNumber <= updatedCtoon.initialQuantity

      // 2) If not special, deduct points + log
      if (!isSpecial) {
        const updated = await tx.userPoints.update({
          where: { userId },
          data:  { points: { decrement: ctoon.price } }
        })
        await tx.pointsLog.create({
          data: {
            userId,
            points: ctoon.price,
            total: updated.points,
            method: 'Bought cToon',
            direction: 'decrease'
          }
        })
      }

      // 3) Create the UserCtoon with the atomic mintNumber
      const uc = await tx.userCtoon.create({
        data: { userId, ctoonId, mintNumber, isFirstEdition },
        select: { id: true, mintNumber: true }
      })

      // 4) Create ownership log
      await tx.ctoonOwnerLog.create({
        data: {
          userId,
          ctoonId,
          userCtoonId: uc.id,
          mintNumber: uc.mintNumber
        }
      })
    })
}, { connection })

// Optional: logging
worker.on('completed', job => {
  // console.log(`Mint job ${job.id} completed`)
})
worker.on('failed', (job, err) => {
  // console.error(`Mint job ${job?.id} failed: ${err.message}`)
})

export default worker
