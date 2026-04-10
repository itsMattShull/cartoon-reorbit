import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { logAdminChange } from '../utils/adminChangeLog.js'
import { scheduleDissolveAuctionLaunch } from '../utils/queues.js'

const QUEUE_NAME = process.env.DISSOLVE_QUEUE_KEY || 'dissolveQueue'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

function buildDissolvedDiscordId(userId, discordId) {
  const safe = discordId || 'unknown'
  return `dissolved:${userId}:${safe}`
}

function rarityFloor(rarityRaw) {
  const r = (rarityRaw || '').trim().toLowerCase()
  if (r === 'common') return 25
  if (r === 'uncommon') return 50
  if (r === 'rare') return 100
  if (r === 'very rare') return 187
  if (r === 'crazy rare') return 312
  return 50
}

async function progress(job, pct, step) {
  await job.updateProgress({ pct, step })
}

const worker = new Worker(QUEUE_NAME, async (job) => {
  const { userId, officialId, officialUsername, adminId, adminUsername } = job.data

  let pointsTransferred = 0
  let ctoonsTransferred = 0
  let ctoonsQueued = 0
  let auctionsReassigned = 0
  let bidsDeleted = 0
  let bidsReassigned = 0
  let highestReassigned = 0
  let autoBidsDeleted = 0
  let autoBidsReassigned = 0
  let tradeOffersReassigned = 0

  await progress(job, 0, 'Starting…')

  // Load target user
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, discordId: true, username: true, active: true, banned: true }
  })
  if (!target) throw new Error(`User ${userId} not found`)

  await progress(job, 5, 'Loading data…')

  // ── Step 1: Points transfer ──────────────────────────────────────────────
  const up = await prisma.userPoints.findUnique({ where: { userId } })
  const amt = Math.max(0, up?.points || 0)
  if (amt > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.userPoints.update({ where: { userId }, data: { points: 0, updatedAt: new Date() } })
      await tx.pointsLog.create({
        data: { userId, direction: 'decrease', points: amt, total: 0, method: 'ACCOUNT_DISSOLVE' }
      })
      const off = await tx.userPoints.upsert({
        where: { userId: officialId },
        update: { points: { increment: amt }, updatedAt: new Date() },
        create: { userId: officialId, points: amt }
      })
      await tx.pointsLog.create({
        data: { userId: officialId, direction: 'increase', points: amt, total: off.points, method: 'ACCOUNT_DISSOLVE' }
      })
    })
    pointsTransferred = amt
  }

  await progress(job, 10, 'Points transferred…')

  // ── Step 2: cToons ───────────────────────────────────────────────────────
  const userCtoons = await prisma.userCtoon.findMany({
    where: { userId, burnedAt: null },
    select: { id: true, ctoon: { select: { id: true, rarity: true, series: true } }, mintNumber: true }
  })
  const total = userCtoons.length

  const queuedEntries = []  // { id, category } — tracked for Step 9 scheduling

  for (let i = 0; i < userCtoons.length; i++) {
    const uc = userCtoons[i]

    const activeAuction = await prisma.auction.findFirst({
      where: { userCtoonId: uc.id, status: 'ACTIVE' },
      select: { id: true }
    })

    if (activeAuction) {
      const { count } = await prisma.auction.updateMany({
        where: { userCtoonId: uc.id, status: 'ACTIVE' },
        data: { creatorId: officialId }
      })
      auctionsReassigned += count
      await prisma.userCtoon.update({ where: { id: uc.id }, data: { isTradeable: false } })
    } else {
      await prisma.userCtoon.update({ where: { id: uc.id }, data: { userId: officialId, isTradeable: false } })
      await prisma.userTradeListItem.deleteMany({ where: { userCtoonId: uc.id, userId: { not: officialId } } })
      await prisma.ctoonOwnerLog.create({
        data: {
          userId: officialId,
          userCtoonId: uc.id,
          ctoonId: uc.ctoon?.id ?? null,
          mintNumber: uc.mintNumber ?? null
        }
      })
      ctoonsTransferred++

      const isPokemon   = (uc.ctoon?.series || '').toLowerCase() === 'pokemon'
      const isCrazyRare = (uc.ctoon?.rarity || '').toLowerCase() === 'crazy rare'
      const category    = isPokemon ? 'POKEMON' : (isCrazyRare ? 'CRAZY_RARE' : 'OTHER')
      const isFeatured  = isPokemon || isCrazyRare

      const queueEntry = await prisma.dissolveAuctionQueue.upsert({
        where:  { userCtoonId: uc.id },
        update: {},
        create: { userCtoonId: uc.id, category, isFeatured },
        select: { id: true, category: true }
      })
      queuedEntries.push({ id: queueEntry.id, category: queueEntry.category })
      ctoonsQueued++
    }

    // Progress from 10% to 70% across all cToons
    await progress(job, 10 + Math.floor(60 * (i + 1) / Math.max(total, 1)), `Processing cToons… (${i + 1}/${Math.max(total, 1)})`)
  }

  await progress(job, 70, 'Reassigning auctions…')

  // ── Step 3: Reassign remaining active auctions created by target ─────────
  const aRe = await prisma.auction.updateMany({ where: { creatorId: userId, status: 'ACTIVE' }, data: { creatorId: officialId } })
  auctionsReassigned += aRe.count

  // ── Step 4: Bids ─────────────────────────────────────────────────────────
  await progress(job, 75, 'Handling bids…')

  const topBidAuctions = await prisma.auction.findMany({
    where: { highestBidderId: userId, status: 'ACTIVE' },
    select: { id: true }
  })
  const topBidAuctionIds = topBidAuctions.map(a => a.id)

  const { count: activeBidsDeleted } = await prisma.bid.deleteMany({
    where: { userId, auction: { status: 'ACTIVE' } }
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

  const bRe = await prisma.bid.updateMany({ where: { userId }, data: { userId: officialId } })
  bidsReassigned = bRe.count

  const hbRe = await prisma.auction.updateMany({ where: { highestBidderId: userId }, data: { highestBidderId: officialId } })
  highestReassigned = hbRe.count

  // ── Step 5: Auto-bids ────────────────────────────────────────────────────
  await progress(job, 82, 'Handling auto-bids…')

  const { count: activeAutoBidsDeleted } = await prisma.auctionAutoBid.deleteMany({
    where: { userId, auction: { status: 'ACTIVE' } }
  })
  autoBidsDeleted = activeAutoBidsDeleted

  const userAutoBids = await prisma.auctionAutoBid.findMany({
    where: { userId },
    select: { id: true, auctionId: true, maxAmount: true, isActive: true }
  })
  for (const row of userAutoBids) {
    const existing = await prisma.auctionAutoBid.findUnique({
      where: { auctionId_userId: { auctionId: row.auctionId, userId: officialId } },
      select: { id: true, maxAmount: true, isActive: true }
    }).catch(() => null)

    if (existing) {
      const newMax = Math.max(existing.maxAmount ?? 0, row.maxAmount ?? 0)
      const newActive = !!(existing.isActive || row.isActive)
      await prisma.auctionAutoBid.update({ where: { id: existing.id }, data: { maxAmount: newMax, isActive: newActive } })
      await prisma.auctionAutoBid.delete({ where: { id: row.id } })
    } else {
      await prisma.auctionAutoBid.update({ where: { id: row.id }, data: { userId: officialId } })
    }
    autoBidsReassigned++
  }

  // ── Step 6: Trade offers ─────────────────────────────────────────────────
  await progress(job, 87, 'Reassigning trade offers…')

  const toRe = await prisma.tradeOffer.updateMany({ where: { initiatorId: userId }, data: { initiatorId: officialId } })
  tradeOffersReassigned = toRe.count

  // ── Step 7: Deactivate account ───────────────────────────────────────────
  await progress(job, 92, 'Deactivating account…')

  await prisma.user.update({
    where: { id: userId },
    data: {
      active: false,
      discordId: buildDissolvedDiscordId(userId, target.discordId),
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null
    }
  })

  // ── Step 8: History note + audit log ────────────────────────────────────
  await progress(job, 96, 'Writing history…')

  await prisma.userBanNote.create({
    data: {
      userId,
      adminId,
      action: 'DISSOLVE',
      reason: `Account dissolved by ${adminUsername || adminId}. Points (${pointsTransferred}) moved to ${officialUsername}; cToons transferred to ${officialUsername} and added to auction queue (${ctoonsQueued}). Active auction bids deleted (${bidsDeleted} bids, ${autoBidsDeleted} auto-bids).`
    }
  })

  await logAdminChange(prisma, {
    userId: adminId,
    area: 'Admin:Users',
    key: 'dissolveUser',
    prevValue: { active: target.active, banned: target.banned },
    newValue: {
      active: false,
      pointsTransferred,
      ctoonsTransferred,
      ctoonsQueued,
      auctionsReassigned,
      bidsDeleted,
      bidsReassigned,
      highestReassigned,
      autoBidsDeleted,
      autoBidsReassigned,
      tradeOffersReassigned
    }
  })

  // ── Step 9: Schedule dissolve auction launches ───────────────────────────
  const { scheduleConfig } = job.data
  if (scheduleConfig && queuedEntries.length) {
    const { startAtUtc, cadenceDays, pokemonPerCadence, crazyRarePerCadence, otherPerCadence } = scheduleConfig
    const startMs = new Date(startAtUtc).getTime()

    const perCategory = {
      POKEMON:    Number(pokemonPerCadence)    || 0,
      CRAZY_RARE: Number(crazyRarePerCadence)  || 0,
      OTHER:      Number(otherPerCadence)      || 0,
    }

    const grouped = { POKEMON: [], CRAZY_RARE: [], OTHER: [] }
    for (const e of queuedEntries) grouped[e.category].push(e.id)

    for (const [cat, ids] of Object.entries(grouped)) {
      const countPerCadence = perCategory[cat]
      if (!countPerCadence || !ids.length) continue
      const intervalMs = (Number(cadenceDays) * 24 * 3600 * 1000) / countPerCadence

      for (let i = 0; i < ids.length; i++) {
        const scheduledFor = new Date(startMs + i * intervalMs)
        await prisma.dissolveAuctionQueue.update({
          where: { id: ids[i] },
          data:  { scheduledFor }
        })
        await scheduleDissolveAuctionLaunch(ids[i], scheduledFor)
      }
    }
  }

  await progress(job, 100, 'Done')

  return {
    pointsTransferred,
    ctoonsTransferred,
    ctoonsQueued,
    auctionsReassigned,
    bidsDeleted,
    bidsReassigned,
    highestReassigned,
    autoBidsDeleted,
    autoBidsReassigned,
    tradeOffersReassigned
  }
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`[dissolve worker] Job ${job?.id} failed:`, err)
})

export default worker
