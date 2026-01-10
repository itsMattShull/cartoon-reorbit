// server/api/admin/auction-only/index.post.js
import dotenv from 'dotenv'
dotenv.config()
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
const OWNER_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

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
  const {
    userCtoonId: ucIdIn,
    ctoonId: ctoonIdIn,
    pricePoints,
    startsAtUtc,
    durationDays,
    isFeatured,
    createCount = 1,
    releaseEveryHours = 0
  } = body || {}

  const isFeaturedFlag = !!isFeatured
  if (!Number.isInteger(pricePoints) || pricePoints < 0) throw createError({ statusCode: 400, statusMessage: 'Invalid pricePoints' })
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 5) throw createError({ statusCode: 400, statusMessage: 'durationDays must be 1–5' })
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

  const pending = await prisma.auctionOnly.findMany({
    where: { isStarted: false },
    select: { userCtoonId: true }
  })
  const pendingIds = pending.map(p => p.userCtoonId)

  const available = await prisma.userCtoon.findMany({
    where: {
      userId: owner.id,
      ctoonId,
      id: { notIn: pendingIds }
    },
    orderBy: [
      { mintNumber: 'asc' },
      { createdAt: 'asc' }
    ],
    select: { id: true, mintNumber: true, createdAt: true }
  })

  if (available.length < count) {
    throw createError({ statusCode: 400, statusMessage: `Not enough owned copies to create ${count} auctions` })
  }

  const sorted = [...available].sort((a, b) => {
    const aMint = Number.isInteger(a.mintNumber) ? a.mintNumber : Number.POSITIVE_INFINITY
    const bMint = Number.isInteger(b.mintNumber) ? b.mintNumber : Number.POSITIVE_INFINITY
    if (aMint !== bMint) return aMint - bMint
    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  let userCtoonIds = sorted.map(a => a.id)
  if (ucIdIn) {
    if (!userCtoonIds.includes(ucIdIn)) {
      throw createError({ statusCode: 400, statusMessage: 'Selected copy is already scheduled' })
    }
    userCtoonIds = [ucIdIn, ...userCtoonIds.filter(id => id !== ucIdIn)]
  }
  userCtoonIds = userCtoonIds.slice(0, count)

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

  const created = await prisma.auctionOnly.createMany({ data: rows })
  return { count: created.count }
})
