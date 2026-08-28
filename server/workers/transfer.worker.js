import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { logAdminChange, buildSeizureAuditPayload } from '../utils/adminChangeLog.js'

const QUEUE_NAME = process.env.TRANSFER_QUEUE_KEY || 'transferQueue'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

function buildDeactivatedDiscordId(userId, discordId) {
  const safe = discordId || 'unknown'
  return `transferred:${userId}:${safe}`
}

async function progress(job, pct, step) {
  await job.updateProgress({ pct, step })
}

const worker = new Worker(QUEUE_NAME, async (job) => {
  const { sourceUserId, targetUserId, adminId, adminUsername } = job.data

  let pointsTransferred = 0
  let ctoonsTransferred = 0
  let auctionsReassigned = 0
  let bidsDeleted = 0
  let bidsReassigned = 0
  let highestReassigned = 0
  let autoBidsDeleted = 0
  let autoBidsReassigned = 0
  let tradeOffersWithdrawn = 0
  let tradeOffersRejected = 0

  await progress(job, 0, 'Starting…')

  // Re-validate at execution time — state may have drifted since the admin
  // clicked through the confirmation screens (banned/deactivated meanwhile,
  // or picked up by another transfer job in the interim).
  const [source, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sourceUserId },
      select: { id: true, discordId: true, username: true, active: true, banned: true, isAdmin: true }
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, active: true, banned: true }
    }),
  ])
  if (!source) throw new Error(`Source user ${sourceUserId} not found`)
  if (!target) throw new Error(`Target user ${targetUserId} not found`)
  if (source.banned) throw new Error('Source user is banned')
  if (!source.active) throw new Error('Source user is already inactive')
  if (target.banned) throw new Error('Target user is banned')
  if (!target.active) throw new Error('Target user is inactive')

  await progress(job, 5, 'Loading data…')

  // ── Step 1: Points transfer ──────────────────────────────────────────────
  const up = await prisma.userPoints.findUnique({ where: { userId: sourceUserId } })
  const amt = Math.max(0, up?.points || 0)
  if (amt > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.userPoints.update({ where: { userId: sourceUserId }, data: { points: 0, updatedAt: new Date() } })
      await tx.pointsLog.create({
        data: { userId: sourceUserId, direction: 'decrease', points: amt, total: 0, method: 'ADMIN_TRANSFER' }
      })
      const dest = await tx.userPoints.upsert({
        where: { userId: targetUserId },
        update: { points: { increment: amt }, updatedAt: new Date() },
        create: { userId: targetUserId, points: amt }
      })
      await tx.pointsLog.create({
        data: { userId: targetUserId, direction: 'increase', points: amt, total: dest.points, method: 'ADMIN_TRANSFER' }
      })
    })
    pointsTransferred = amt
  }

  await progress(job, 15, 'Points transferred…')

  // ── Step 2: cToons ───────────────────────────────────────────────────────
  const userCtoons = await prisma.userCtoon.findMany({
    where: { userId: sourceUserId, burnedAt: null },
    select: { id: true, ctoon: { select: { id: true, name: true, rarity: true } }, mintNumber: true }
  })
  const total = userCtoons.length
  const transferredCtoons = []  // audit detail for confirmed successful transfers only

  for (let i = 0; i < userCtoons.length; i++) {
    const uc = userCtoons[i]

    const activeAuction = await prisma.auction.findFirst({
      where: { userCtoonId: uc.id, status: 'ACTIVE' },
      select: { id: true }
    })

    if (activeAuction) {
      // Leave the cToon itself alone mid-auction; just hand the auction (and
      // its eventual proceeds) to the target so bidding isn't disrupted.
      const { count } = await prisma.auction.updateMany({
        where: { userCtoonId: uc.id, status: 'ACTIVE' },
        data: { creatorId: targetUserId }
      })
      auctionsReassigned += count
      await prisma.userCtoon.update({ where: { id: uc.id }, data: { isTradeable: false } })
    } else {
      await prisma.userCtoon.update({
        where: { id: uc.id },
        data: { userId: targetUserId, lockedByUserId: null, inCzone: false }
      })
      await prisma.userTradeListItem.deleteMany({ where: { userCtoonId: uc.id, userId: { not: targetUserId } } })
      await prisma.ctoonOwnerLog.create({
        data: {
          userId: targetUserId,
          userCtoonId: uc.id,
          ctoonId: uc.ctoon?.id ?? null,
          mintNumber: uc.mintNumber ?? null,
          method: 'ADMIN_TRANSFER'
        }
      })
      ctoonsTransferred++
      transferredCtoons.push({
        name: uc.ctoon?.name ?? 'cToon',
        rarity: uc.ctoon?.rarity ?? null,
        mintNumber: uc.mintNumber ?? null,
        takenFromUsername: source.username
      })
    }

    // Progress from 15% to 65% across all cToons
    await progress(job, 15 + Math.floor(50 * (i + 1) / Math.max(total, 1)), `Transferring cToons… (${i + 1}/${Math.max(total, 1)})`)
  }

  await progress(job, 65, 'Reassigning auctions…')

  // ── Step 3: Reassign remaining active auctions created by source ────────
  const aRe = await prisma.auction.updateMany({ where: { creatorId: sourceUserId, status: 'ACTIVE' }, data: { creatorId: targetUserId } })
  auctionsReassigned += aRe.count

  // ── Step 4: Bids ─────────────────────────────────────────────────────────
  await progress(job, 72, 'Handling bids…')

  const topBidAuctions = await prisma.auction.findMany({
    where: { highestBidderId: sourceUserId, status: 'ACTIVE' },
    select: { id: true }
  })
  const topBidAuctionIds = topBidAuctions.map(a => a.id)

  const { count: activeBidsDeleted } = await prisma.bid.deleteMany({
    where: { userId: sourceUserId, auction: { status: 'ACTIVE' } }
  })
  bidsDeleted = activeBidsDeleted

  for (const auctionId of topBidAuctionIds) {
    const newTop = await prisma.bid.findFirst({
      where: { auctionId },
      orderBy: { amount: 'desc' },
      select: { userId: true, amount: true }
    })
    await prisma.auction.update({
      where: { id: auctionId },
      data: { highestBid: newTop?.amount ?? 0, highestBidderId: newTop?.userId ?? null }
    })
  }

  const bRe = await prisma.bid.updateMany({ where: { userId: sourceUserId }, data: { userId: targetUserId } })
  bidsReassigned = bRe.count

  const hbRe = await prisma.auction.updateMany({ where: { highestBidderId: sourceUserId }, data: { highestBidderId: targetUserId } })
  highestReassigned = hbRe.count

  // ── Step 5: Auto-bids ────────────────────────────────────────────────────
  await progress(job, 80, 'Handling auto-bids…')

  const { count: activeAutoBidsDeleted } = await prisma.auctionAutoBid.deleteMany({
    where: { userId: sourceUserId, auction: { status: 'ACTIVE' } }
  })
  autoBidsDeleted = activeAutoBidsDeleted

  const userAutoBids = await prisma.auctionAutoBid.findMany({
    where: { userId: sourceUserId },
    select: { id: true, auctionId: true, maxAmount: true, isActive: true }
  })
  for (const row of userAutoBids) {
    const existing = await prisma.auctionAutoBid.findUnique({
      where: { auctionId_userId: { auctionId: row.auctionId, userId: targetUserId } },
      select: { id: true, maxAmount: true, isActive: true }
    }).catch(() => null)

    if (existing) {
      const newMax = Math.max(existing.maxAmount ?? 0, row.maxAmount ?? 0)
      const newActive = !!(existing.isActive || row.isActive)
      await prisma.auctionAutoBid.update({ where: { id: existing.id }, data: { maxAmount: newMax, isActive: newActive } })
      await prisma.auctionAutoBid.delete({ where: { id: row.id } })
    } else {
      await prisma.auctionAutoBid.update({ where: { id: row.id }, data: { userId: targetUserId } })
    }
    autoBidsReassigned++
  }

  // ── Step 6: Trade offers — withdraw/reject all pending ──────────────────
  await progress(job, 87, 'Handling trade offers…')

  const pendingAsInitiator = await prisma.tradeOffer.findMany({
    where: { initiatorId: sourceUserId, status: 'PENDING' },
    select: { id: true }
  })
  if (pendingAsInitiator.length) {
    const ids = pendingAsInitiator.map(o => o.id)
    await prisma.$transaction(async (tx) => {
      const upd = await tx.tradeOffer.updateMany({
        where: { id: { in: ids } },
        data: { status: 'WITHDRAWN', updatedAt: new Date() }
      })
      tradeOffersWithdrawn = upd.count
      await tx.lockedPoints.updateMany({
        where: { userId: sourceUserId, status: 'ACTIVE', contextType: 'TRADE', contextId: { in: ids } },
        data: { status: 'RELEASED' }
      })
    })
  }

  const pendingAsRecipient = await prisma.tradeOffer.findMany({
    where: { recipientId: sourceUserId, status: 'PENDING' },
    select: { id: true }
  })
  if (pendingAsRecipient.length) {
    const ids = pendingAsRecipient.map(o => o.id)
    await prisma.$transaction(async (tx) => {
      const upd = await tx.tradeOffer.updateMany({
        where: { id: { in: ids } },
        data: { status: 'REJECTED', updatedAt: new Date() }
      })
      tradeOffersRejected = upd.count
      await tx.lockedPoints.updateMany({
        where: { status: 'ACTIVE', contextType: 'TRADE', contextId: { in: ids } },
        data: { status: 'RELEASED' }
      })
    })
  }

  // Any remaining locked points on the source (e.g. auction locks) are no
  // longer meaningful once the account is deactivated — release them.
  await prisma.lockedPoints.updateMany({
    where: { userId: sourceUserId, status: 'ACTIVE' },
    data: { status: 'RELEASED' }
  })

  // ── Step 7: Deactivate + anonymize source account ────────────────────────
  await progress(job, 93, 'Deactivating source account…')

  await prisma.user.update({
    where: { id: sourceUserId },
    data: {
      active: false,
      discordId: buildDeactivatedDiscordId(sourceUserId, source.discordId),
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null
    }
  })

  // ── Step 8: History note + audit log ────────────────────────────────────
  await progress(job, 97, 'Writing history…')

  await prisma.userBanNote.create({
    data: {
      userId: sourceUserId,
      adminId,
      action: 'TRANSFER',
      reason: `Assets transferred by ${adminUsername || adminId} to ${target.username}. Points (${pointsTransferred}) and cToons (${ctoonsTransferred}) moved; account deactivated. Active auction bids deleted (${bidsDeleted} bids, ${autoBidsDeleted} auto-bids). Pending trade offers withdrawn (${tradeOffersWithdrawn}) and rejected (${tradeOffersRejected}).`
    }
  })

  await logAdminChange(prisma, {
    userId: adminId,
    targetUserId: sourceUserId,
    targetUsername: source.username,
    area: 'Admin:Users',
    key: 'transferUser',
    prevValue: { active: source.active, banned: source.banned },
    newValue: {
      active: false,
      targetUserId,
      targetUsername: target.username,
      sourceWasAdmin: source.isAdmin,
      auctionsReassigned,
      bidsDeleted,
      bidsReassigned,
      highestReassigned,
      autoBidsDeleted,
      autoBidsReassigned,
      tradeOffersWithdrawn,
      tradeOffersRejected,
      ...buildSeizureAuditPayload({
        action: 'transfer',
        target: target.username,
        pointsRemoved: pointsTransferred,
        pointsRecipient: target.username,
        ctoons: transferredCtoons
      })
    }
  })

  await progress(job, 100, 'Done')

  return {
    sourceUsername: source.username,
    targetUsername: target.username,
    pointsTransferred,
    ctoonsTransferred,
    auctionsReassigned,
    bidsDeleted,
    bidsReassigned,
    highestReassigned,
    autoBidsDeleted,
    autoBidsReassigned,
    tradeOffersWithdrawn,
    tradeOffersRejected
  }
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`[transfer worker] Job ${job?.id} failed:`, err)
})

export default worker
