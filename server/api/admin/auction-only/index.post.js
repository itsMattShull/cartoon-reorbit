// server/api/admin/auction-only/index.post.js
import dotenv from 'dotenv'
dotenv.config()
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { mintQueue } from '../../../utils/queues'   // path: server/api/admin/auction-only/ → ../../../utils/queues
import { QueueEvents } from 'bullmq'

const OWNER_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

export default defineEventHandler(async (event) => {
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
  const { userCtoonId: ucIdIn, ctoonId: ctoonIdIn, pricePoints, startsAtUtc, durationDays } = body || {}

  if (!Number.isInteger(pricePoints) || pricePoints < 0) throw createError({ statusCode: 400, statusMessage: 'Invalid pricePoints' })
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 5) throw createError({ statusCode: 400, statusMessage: 'durationDays must be 1–5' })
  if (!startsAtUtc) throw createError({ statusCode: 400, statusMessage: 'startsAtUtc required' })
  const startsAt = new Date(startsAtUtc)
  if (isNaN(startsAt.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid startsAtUtc' })

  const owner = await prisma.user.findUnique({ where: { username: OWNER_USERNAME }, select: { id: true } })
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Owner account not found' })

  // normalize to hour precision
  const normStarts = new Date(startsAt); normStarts.setUTCMinutes(0, 0, 0)
  const endsAt = new Date(normStarts.getTime() + durationDays * 86400000)

  // Resolve a valid userCtoonId. If not owned, mint one to owner first.
  let userCtoonId = null
  let ctoonId = ctoonIdIn || null

  // If a userCtoonId was passed, verify ownership
  if (ucIdIn) {
    const uc = await prisma.userCtoon.findFirst({
      where: { id: ucIdIn },
      select: { id: true, userId: true, ctoonId: true }
    })
    if (uc && uc.userId === owner.id) {
      userCtoonId = uc.id
      ctoonId = uc.ctoonId
    }
  }

  // If still no owned copy, we need a ctoonId to mint
  if (!userCtoonId) {
    if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'ctoonId required when not owned' })

    // Mint to the owner, wait for completion
    let queueEvents
    try {
      const job = await mintQueue.add('mintCtoon', { userId: owner.id, ctoonId, isSpecial: true })
      queueEvents = new QueueEvents(mintQueue.name, { connection: redisConnection })
      await queueEvents.waitUntilReady()
      await job.waitUntilFinished(queueEvents)
    } catch (err) {
      const msg = err?.message || 'Mint failed'
      let statusCode = 500
      if (/sold out/i.test(msg)) statusCode = 410
      else if (/insufficient points/i.test(msg)) statusCode = 400
      else if (/purchase limit/i.test(msg)) statusCode = 403
      else if (/not-for-sale/i.test(msg)) statusCode = 404
      throw createError({ statusCode, statusMessage: msg })
    } finally {
      // best-effort cleanup
      try { /* eslint-disable no-unused-expressions */ await prisma.$disconnect } catch {}
    }

    // Fetch the newest minted copy for the owner & cToon
    const newest = await prisma.userCtoon.findFirst({
      where: { userId: owner.id, ctoonId },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    })
    if (!newest) throw createError({ statusCode: 500, statusMessage: 'Mint succeeded but no UserCtoon found' })
    userCtoonId = newest.id
  }

  // Create the scheduled AuctionOnly row
  const created = await prisma.auctionOnly.create({
    data: {
      userCtoonId,
      pricePoints,
      startsAt: normStarts,
      endsAt,
      createdById: me.id ?? null
    },
    select: { id: true }
  })

  return { id: created.id }
})
