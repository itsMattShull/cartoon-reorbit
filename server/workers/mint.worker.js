// server/workers/mint.worker.js
import { Worker } from 'bullmq'
import { prisma } from '@/server/prisma'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

// Create a BullMQ worker to process mint jobs
const worker = new Worker('mintQueue', async job => {
  try {
    const { userId, ctoonId, isSpecial = false } = job.data

    // Fetch cToon details
    const ctoon = await prisma.ctoon.findUnique({ where: { id: ctoonId } })
    if (!ctoon) throw new Error('Invalid or not-for-sale cToon')

    // Count how many have been minted and existing user purchases
    const totalMinted = await prisma.userCtoon.count({ where: { ctoonId } })
    const existing = await prisma.userCtoon.findMany({ where: { userId, ctoonId } })

    // Sold-out check
    if (ctoon.quantity !== null && totalMinted >= ctoon.quantity) {
      throw new Error('cToon sold out')
    }

    // Wallet balance check
    const wallet = await prisma.userPoints.findUnique({ where: { userId } })
    if (!isSpecial && (!wallet || wallet.points < ctoon.price)) {
      throw new Error('Insufficient points')
    }

    // Per-user limit enforcement (first 48h window)
    if (!isSpecial && ctoon.releaseDate) {
      const hoursSinceRelease = (Date.now() - new Date(ctoon.releaseDate).getTime()) / (1000 * 60 * 60)
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

    // Calculate mintNumber and first-edition flag
    const mintNumber = totalMinted + 1
    const isFirstEdition =
      ctoon.initialQuantity === null || mintNumber <= ctoon.initialQuantity

    // Perform the minting transaction
    if (!isSpecial) {
      await prisma.$transaction([
        prisma.userPoints.update({
          where: { userId },
          data: { points: { decrement: ctoon.price } }
        }),
        prisma.userCtoon.create({
          data: { userId, ctoonId, mintNumber, isFirstEdition }
        })
      ])
    } else {
      await prisma.$transaction([
        prisma.userCtoon.create({
          data: { userId, ctoonId, mintNumber, isFirstEdition }
        })
      ])
    }

  } finally {
    await prisma.$disconnect()
  }
}, { connection })

// Optional: logging
worker.on('completed', job => {
  // console.log(`Mint job ${job.id} completed`)
})
worker.on('failed', (job, err) => {
  console.error(`Mint job ${job?.id} failed: ${err.message}`)
})
