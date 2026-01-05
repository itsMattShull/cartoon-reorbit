// server/api/admin/auction-only/index.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const rows = await prisma.auctionOnly.findMany({
    orderBy: { startsAt: 'desc' },
    include: {
      userCtoon: {
        include: {
          ctoon: {
            select: { id: true, name: true, rarity: true, assetPath: true }
          }
        }
      }
    }
  })

  return rows.map(r => ({
    id: r.id,
    pricePoints: r.pricePoints,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    isFeatured: r.isFeatured,
    ctoon: r.userCtoon.ctoon
  }))
})
