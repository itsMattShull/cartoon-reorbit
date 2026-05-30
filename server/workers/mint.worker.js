import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

// Create a BullMQ worker to process mint jobs
const worker = new Worker(process.env.MINT_QUEUE_KEY, async job => {
    const { userId, ctoonId, isSpecial = false, effectivePrice, userPackId = null } = job.data

    const TIME_BASED_CAP = 999999999

    // Fetch cToon details
    const ctoon = await prisma.ctoon.findUnique({ where: { id: ctoonId } })
    if (!ctoon) throw new Error('Invalid or not-for-sale cToon')

    // ───────────────────── Time-based mint window guard ─────────────────────
    if (ctoon.mintLimitType === 'timeBased' && ctoon.mintEndDate) {
      if (new Date(ctoon.mintEndDate) <= new Date()) {
        // After the minting window closes the mint-end job finalizes the quantity
        // (changes it away from TIME_BASED_CAP).  Only hard-block while the sentinel
        // is still in place; once finalized, fall through and let normal sold-out
        // checks handle clearance purchases.
        if (ctoon.quantity === TIME_BASED_CAP) {
          throw new Error('Minting period has ended')
        }
        // quantity is finalized — fall through to normal sold-out checks
      }
    }

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

    // Count existing user purchases for limit checks (first-owner only)
    const existingRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT ON ("userCtoonId") "userCtoonId", "userId"
        FROM "CtoonOwnerLog"
        WHERE "ctoonId" = ${ctoonId}
          AND "userCtoonId" IS NOT NULL
        ORDER BY "userCtoonId", "createdAt" ASC
      ) first_logs
      WHERE "userId" = ${userId}
    `
    const existing = existingRows[0]?.count ?? 0

    // Wallet balance check (available = total - active locks)
    const [wallet, activeLocks] = await Promise.all([
      prisma.userPoints.findUnique({ where: { userId }, select: { points: true } }),
      prisma.lockedPoints.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { amount: true }
      })
    ])
    const totalPoints = wallet?.points ?? 0
    const lockedSum = activeLocks.reduce((acc, lock) => acc + (lock.amount || 0), 0)
    const availablePoints = totalPoints - lockedSum
    const chargePrice = (typeof effectivePrice === 'number' && effectivePrice >= 0) ? effectivePrice : ctoon.price
    if (!isSpecial && availablePoints < chargePrice) {
      throw new Error('Insufficient points')
    }

    // Per-user limit enforcement
    if (!isSpecial) {
      if (ctoon.mintLimitType === 'timeBased') {
        // ── Time-based release purchase limits (replaces 48h perUserLimit for this type) ──
        // Resolve limit: per-cToon override first, then rarity defaults from global config,
        // then hardcoded defaults as a final safety net.
        const HARDCODED_TIME_BASED_LIMITS = {
          'Common':     { count: 5, windowDays: null },
          'Uncommon':   { count: 4, windowDays: null },
          'Rare':       { count: 3, windowDays: null },
          'Very Rare':  { count: 2, windowDays: null },
          'Crazy Rare': { count: 1, windowDays: null }
        }

        let limitCount    = ctoon.timeBasedLimitCount    ?? null
        let windowDays    = ctoon.timeBasedLimitWindowDays ?? null

        if (limitCount === null || windowDays === null) {
          try {
            const cfg = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
            const rarityLimits = cfg?.timeBasedPurchaseLimits
            if (rarityLimits && rarityLimits[ctoon.rarity]) {
              const def = rarityLimits[ctoon.rarity]
              if (limitCount === null && def.count != null) limitCount = Number(def.count)
              if (windowDays === null && def.windowDays != null) windowDays = Number(def.windowDays)
            }
          } catch {}

          // Fallback to hardcoded defaults if the global config is missing or lacks this rarity.
          // This ensures limits are always enforced for time-based cToons even when the DB is
          // not yet seeded with timeBasedPurchaseLimits.
          if (limitCount === null && HARDCODED_TIME_BASED_LIMITS[ctoon.rarity]) {
            const def = HARDCODED_TIME_BASED_LIMITS[ctoon.rarity]
            if (def.count != null) limitCount = Number(def.count)
            if (windowDays === null && def.windowDays != null) windowDays = Number(def.windowDays)
          }
        }

        if (limitCount !== null && limitCount > 0) {
          // Determine window start:
          // windowDays > 0 → rolling N-day window; otherwise use full release window (releaseDate → mintEndDate)
          let windowStart
          if (windowDays != null && windowDays > 0) {
            windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
          } else {
            // Full release window — count all purchases since releaseDate
            windowStart = ctoon.releaseDate ? new Date(ctoon.releaseDate) : new Date(0)
          }

          const purchasesInWindow = await prisma.cmartPurchaseLog.count({
            where: { userId, ctoonId, createdAt: { gte: windowStart } }
          })

          if (purchasesInWindow >= limitCount) {
            const windowDesc = (windowDays != null && windowDays > 0)
              ? `${windowDays}-day window`
              : 'this release'
            throw new Error(`Purchase limit of ${limitCount} for ${windowDesc} reached`)
          }
        }
      } else if (ctoon.releaseDate) {
        // ── Defined-quantity releases: existing 48-hour perUserLimit ──
        const hoursSinceRelease =
          (Date.now() - new Date(ctoon.releaseDate).getTime()) / (1000 * 60 * 60)
        const enforceLimit = hoursSinceRelease < 48
        if (
          enforceLimit &&
          ctoon.perUserLimit !== null &&
          existing >= ctoon.perUserLimit
        ) {
          throw new Error(
            `Purchase limit of ${ctoon.perUserLimit} within first 48h reached`
          )
        }
      } else if (ctoon.perUserLimit !== null && existing >= ctoon.perUserLimit) {
        // Fallback if no releaseDate
        throw new Error(`Purchase limit of ${ctoon.perUserLimit} reached`)
      }
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
        select: {
          totalMinted: true,
          initialQuantity: true,
          quantity: true,
          releaseDate: true,
          initialReleaseQty: true,
          finalReleaseAt: true
        }
      })

      const mintNumber = updatedCtoon.totalMinted
      // Sold-out guard (rolls back the increment if exceeded)
      if (updatedCtoon.quantity !== null && mintNumber > updatedCtoon.quantity) {
        throw new Error('cToon sold out')
      }

      // Window-aware cap (non-special mints only)
      // Skip two-phase logic for time-based cToons (they don't have initial/final windows)
      if (!isSpecial && ctoon.mintLimitType !== 'timeBased' && updatedCtoon.quantity !== null && updatedCtoon.releaseDate) {
        const qty = Number(updatedCtoon.quantity)
        const initialCapFromPct = Math.max(1, Math.floor((qty * Number(initialPercent)) / 100))
        const initialCap = Math.min(
          qty,
          Math.max(1, Number(updatedCtoon.initialReleaseQty ?? initialCapFromPct))
        )
        const finalReleaseAt = updatedCtoon.finalReleaseAt
          ? new Date(updatedCtoon.finalReleaseAt)
          : new Date(new Date(updatedCtoon.releaseDate).getTime() + delayHours * 60 * 60 * 1000)
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
          data:  { points: { decrement: chargePrice } }
        })
        await tx.pointsLog.create({
          data: {
            userId,
            points: chargePrice,
            total: updated.points,
            method: 'Bought cToon',
            direction: 'decrease'
          }
        })
      }

      // 3) Create the UserCtoon with the atomic mintNumber
      const uc = await tx.userCtoon.create({
        data: { userId, ctoonId, mintNumber, isFirstEdition, ...(userPackId ? { userPackId } : {}) },
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

      // 5) Log cMart purchase for bot-clicker detection metrics
      if (!isSpecial) {
        await tx.cmartPurchaseLog.create({
          data: { userId, ctoonId }
        })
      }
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
