// server/api/buy.post.js
import { prisma } from '@/server/prisma'
import { mintQueue } from '../../utils/queues'

export default defineEventHandler(async (event) => {
  try {
    // — Authentication
    const userId = event.context.userId
    if (!userId) {
      throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
    }

    // — Payload validation
    const { ctoonId } = await readBody(event)
    if (!ctoonId) {
      throw createError({ statusCode: 400, statusMessage: 'Missing ctoonId' })
    }

    // — Fetch cToon & related counts
    const ctoon = await prisma.ctoon.findUnique({
      where: { id: ctoonId }
    })
    const totalMinted = await prisma.userCtoon.count({
      where: { ctoonId }
    })
    const existing = await prisma.userCtoon.findMany({
      where: { userId, ctoonId }
    })

    // — Not for sale?
    if (!ctoon || !ctoon.inCmart) {
      throw createError({ statusCode: 404, statusMessage: 'cToon not found or not for sale' })
    }

    // — Sold out?
    if (ctoon.quantity !== null && totalMinted >= ctoon.quantity) {
      throw createError({ statusCode: 410, statusMessage: 'cToon sold out' })
    }

    // — Check user wallet
    const wallet = await prisma.userPoints.findUnique({ where: { userId } })
    if (!wallet || wallet.points < ctoon.price) {
      throw createError({ statusCode: 400, statusMessage: 'Insufficient points' })
    }

    // — Enforce per-user limit
    if (ctoon.releaseDate) {
      const hoursSinceRelease = (Date.now() - new Date(ctoon.releaseDate).getTime()) / (1000 * 60 * 60)
      const enforceLimit = hoursSinceRelease < 48
      if (
        enforceLimit &&
        ctoon.perUserLimit !== null &&
        existing.length >= ctoon.perUserLimit
      ) {
        throw createError({
          statusCode: 403,
          statusMessage: `You can only purchase this cToon up to ${ctoon.perUserLimit} time(s) within the first 48 hours of release.`
        })
      }
    } else if (ctoon.perUserLimit !== null && existing.length >= ctoon.perUserLimit) {
      // fallback if no releaseDate
      throw createError({
        statusCode: 403,
        statusMessage: `You can only purchase this cToon up to ${ctoon.perUserLimit} time(s).`
      })
    }

    // — All checks passed: enqueue the mint job
    await mintQueue.add('mintCtoon', { userId, ctoonId })

    // — Return immediately with 200
    event.node.res.statusCode = 200
    return { success: true, message: 'Enqueued minting job' }

  } finally {
    await prisma.$disconnect()
  }
})
