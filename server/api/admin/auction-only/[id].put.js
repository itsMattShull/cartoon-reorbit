// server/api/admin/auction-only/[id].put.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event)
  const { pricePoints, startsAtUtc, durationDays, isFeatured } = body || {}

  if (!Number.isInteger(pricePoints) || pricePoints < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pricePoints' })
  }
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 5) {
    throw createError({ statusCode: 400, statusMessage: 'durationDays must be 1–5' })
  }
  if (!startsAtUtc) throw createError({ statusCode: 400, statusMessage: 'startsAtUtc required' })
  const startsAt = new Date(startsAtUtc)
  if (isNaN(startsAt.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid startsAtUtc' })

  const existing = await prisma.auctionOnly.findUnique({
    where: { id },
    select: { id: true, startsAt: true, isStarted: true }
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Auction not found' })
  if (existing.isStarted || existing.startsAt <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Auction already started' })
  }

  const normStarts = new Date(startsAt); normStarts.setUTCMinutes(0, 0, 0)
  if (normStarts <= new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Start must be in the future' })
  }
  const endsAt = new Date(normStarts.getTime() + durationDays * 86400000)

  const updated = await prisma.auctionOnly.update({
    where: { id },
    data: {
      pricePoints,
      startsAt: normStarts,
      endsAt,
      isFeatured: !!isFeatured
    },
    select: { id: true }
  })

  return { ok: true, id: updated.id }
})
