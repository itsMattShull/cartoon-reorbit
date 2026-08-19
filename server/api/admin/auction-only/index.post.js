// server/api/admin/auction-only/index.post.js
import dotenv from 'dotenv'
dotenv.config()
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAuctionOnlyError } from '@/server/utils/auctionOnlyErrorLog'
import { selectAuctionOnlyBatch } from '@/server/utils/auctionOnlySchedule'
const OWNER_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

export default defineEventHandler(async (event) => {
  try {
    return await handleAuctionOnlyCreate(event)
  } catch (err) {
    // Validation errors (createError with 4xx) are expected admin input mistakes —
    // only log the ones the admin couldn't have foreseen from the form itself.
    const statusCode = err?.statusCode || 500
    if (statusCode >= 500) {
      await logAuctionOnlyError('schedule', err, null)
    }
    throw err
  }
})

async function handleAuctionOnlyCreate(event) {
  // auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const {
    userCtoonId: ucIdIn,
    ctoonId: ctoonIdIn,
    pricePoints,
    startsAtUtc,
    durationDays,
    isFeatured,
    createCount = 1,
    releaseEveryHours = 0,
    mintMode // undefined | 'mint' | 'availableOnly' — set by the shortfall modal
  } = body || {}

  const isFeaturedFlag = !!isFeatured
  if (!Number.isInteger(pricePoints) || pricePoints < 0) throw createError({ statusCode: 400, statusMessage: 'Invalid pricePoints' })
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 7) throw createError({ statusCode: 400, statusMessage: 'durationDays must be 1–7' })
  const count = Number(createCount ?? 1)
  if (!Number.isInteger(count) || count < 1) throw createError({ statusCode: 400, statusMessage: 'createCount must be >= 1' })
  const releaseHours = Number(releaseEveryHours ?? 0)
  if (count > 1 && (!Number.isInteger(releaseHours) || releaseHours < 1)) {
    throw createError({ statusCode: 400, statusMessage: 'releaseEveryHours must be >= 1' })
  }
  if (!startsAtUtc) throw createError({ statusCode: 400, statusMessage: 'startsAtUtc required' })
  const startsAt = new Date(startsAtUtc)
  if (isNaN(startsAt.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid startsAtUtc' })

  const owner = await prisma.user.findUnique({ where: { username: OWNER_USERNAME }, select: { id: true } })
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Owner account not found' })

  // normalize to hour precision
  const normStarts = new Date(startsAt); normStarts.setUTCMinutes(0, 0, 0)

  let ctoonId = ctoonIdIn || null

  // If a userCtoonId was passed, verify ownership and resolve ctoonId
  if (ucIdIn) {
    const uc = await prisma.userCtoon.findFirst({
      where: { id: ucIdIn },
      select: { id: true, userId: true, ctoonId: true }
    })
    if (!uc || uc.userId !== owner.id) {
      throw createError({ statusCode: 400, statusMessage: 'UserCtoon not owned by official account' })
    }
    ctoonId = uc.ctoonId
  }

  if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'ctoonId required' })

  const TIME_BASED_CAP = 999999999

  // Owner-owned copies of this cToon that are not already scheduled as a pending
  // (unstarted) AuctionOnly. `client` may be the base prisma or a tx client.
  async function loadAvailable(client) {
    const pending = await client.auctionOnly.findMany({
      where: { isStarted: false },
      select: { userCtoonId: true }
    })
    const pendingIds = pending.map(p => p.userCtoonId)
    return client.userCtoon.findMany({
      where: { userId: owner.id, ctoonId, id: { notIn: pendingIds } },
      orderBy: [{ mintNumber: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, mintNumber: true, createdAt: true }
    })
  }

  // Supply snapshot (authoritative cap lives on Ctoon.totalMinted / quantity).
  const ctoonRow = await prisma.ctoon.findUnique({
    where: { id: ctoonId },
    select: { quantity: true, totalMinted: true, initialQuantity: true, mintLimitType: true }
  })
  if (!ctoonRow) throw createError({ statusCode: 404, statusMessage: 'cToon not found' })

  // "Unlimited" = no hard cap: NULL quantity, or a time-based release still
  // carrying the sentinel cap (finalized later). Either way we only ever mint
  // the bounded shortfall, never the raw remaining supply.
  const unlimited =
    ctoonRow.quantity === null ||
    (ctoonRow.mintLimitType === 'timeBased' && ctoonRow.quantity === TIME_BASED_CAP)
  const remaining = unlimited
    ? Infinity
    : Math.max(0, Number(ctoonRow.quantity) - Number(ctoonRow.totalMinted))

  const availablePre = await loadAvailable(prisma)
  const availableCountPre = availablePre.length

  // Shortfall without a decision → tell the client so it can show the modal.
  if (availableCountPre < count && mintMode !== 'mint' && mintMode !== 'availableOnly') {
    const shortfall = count - availableCountPre
    const mintable = unlimited ? shortfall : Math.min(shortfall, remaining)
    return {
      needsDecision: true,
      requested: count,
      available: availableCountPre,
      unlimited,
      quantity: unlimited ? null : Number(ctoonRow.quantity),
      totalMinted: Number(ctoonRow.totalMinted),
      remaining: unlimited ? null : remaining,
      mintable,
      willCreateWithMint: availableCountPre + mintable,
      willCreateAvailableOnly: availableCountPre
    }
  }

  // Atomically mint any needed copies (mint mode only) and create the auctions
  // together, so a partial mint can never leave orphaned copies or orphaned rows.
  const result = await prisma.$transaction(async (tx) => {
    const available = await loadAvailable(tx)
    const availableCount = available.length
    const pool = [...available]

    let minted = 0
    if (mintMode === 'mint') {
      const need = Math.max(0, count - availableCount)
      for (let i = 0; i < need; i++) {
        // Atomic increment with an in-SQL cap guard. Returns 0 rows once the cap
        // is hit (e.g. a concurrent cMart mint got there first) → stop cleanly
        // and auction only what we actually minted.
        const rows = unlimited
          ? await tx.$queryRaw`
              UPDATE "Ctoon" SET "totalMinted" = "totalMinted" + 1
              WHERE id = ${ctoonId}
              RETURNING "totalMinted", "initialQuantity"`
          : await tx.$queryRaw`
              UPDATE "Ctoon" SET "totalMinted" = "totalMinted" + 1
              WHERE id = ${ctoonId} AND "totalMinted" < "quantity"
              RETURNING "totalMinted", "initialQuantity"`
        if (!rows || !rows.length) break

        const mintNumber = Number(rows[0].totalMinted)
        const iq = rows[0].initialQuantity
        const initialQuantity = iq == null ? null : Number(iq)
        const isFirstEdition = initialQuantity === null || mintNumber <= initialQuantity

        const uc = await tx.userCtoon.create({
          data: { userId: owner.id, ctoonId, mintNumber, isFirstEdition, pricePaid: null },
          select: { id: true, mintNumber: true, createdAt: true }
        })
        await tx.ctoonOwnerLog.create({
          data: { userId: owner.id, ctoonId, userCtoonId: uc.id, mintNumber: uc.mintNumber, method: 'ADMIN_GRANT' }
        })
        pool.push(uc)
        minted++
      }
    }

    const finalCount = Math.min(count, pool.length)
    if (finalCount < 1) {
      throw createError({ statusCode: 400, statusMessage: 'No copies available to create auctions' })
    }

    // Includes the admin's explicitly-picked copy, and puts the batch in mint
    // order so the releases follow the mint numbers. See auctionOnlySchedule.js.
    const userCtoonIds = selectAuctionOnlyBatch(pool, finalCount, ucIdIn).map(a => a.id)

    const rows = userCtoonIds.map((id, idx) => {
      const startsAt = new Date(normStarts.getTime() + idx * releaseHours * 3600000)
      const endsAt = new Date(startsAt.getTime() + durationDays * 86400000)
      return {
        userCtoonId: id,
        pricePoints,
        startsAt,
        endsAt,
        isFeatured: isFeaturedFlag,
        createdById: me.id ?? null
      }
    })

    const created = await tx.auctionOnly.createMany({ data: rows })
    return { count: created.count, minted, requested: count }
  }, { timeout: 30000, maxWait: 10000 })

  return result
}
