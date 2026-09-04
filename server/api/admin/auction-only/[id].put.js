// server/api/admin/auction-only/[id].put.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAuctionOnlyError } from '@/server/utils/auctionOnlyErrorLog'
import { FEATURED_OWN_LIMIT_OPTIONS, DEFAULT_FEATURED_OWN_LIMIT } from '@/server/utils/featuredEligibility'

export default defineEventHandler(async (event) => {
  try {
    return await handleAuctionOnlyUpdate(event)
  } catch (err) {
    const statusCode = err?.statusCode || 500
    if (statusCode >= 500) {
      await logAuctionOnlyError('schedule', err, event.context.params?.id || null)
    }
    throw err
  }
})

async function handleAuctionOnlyUpdate(event) {
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
  const { pricePoints, startsAtUtc, durationDays, isFeatured, featuredOwnLimit } = body || {}
  const isFeaturedFlag = !!isFeatured

  let featuredOwnLimitValue = DEFAULT_FEATURED_OWN_LIMIT
  if (isFeaturedFlag && featuredOwnLimit !== undefined) {
    const n = Number(featuredOwnLimit)
    if (!FEATURED_OWN_LIMIT_OPTIONS.includes(n)) {
      throw createError({ statusCode: 400, statusMessage: `featuredOwnLimit must be one of ${FEATURED_OWN_LIMIT_OPTIONS.join(', ')}` })
    }
    featuredOwnLimitValue = n
  }

  if (!Number.isInteger(pricePoints) || pricePoints < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pricePoints' })
  }
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 7) {
    throw createError({ statusCode: 400, statusMessage: 'durationDays must be 1–7' })
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
      isFeatured: isFeaturedFlag,
      featuredOwnLimit: featuredOwnLimitValue
    },
    select: { id: true }
  })

  return { ok: true, id: updated.id }
}
