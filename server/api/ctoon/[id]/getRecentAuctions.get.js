// server/api/ctoon/[id]/getRecentAuctions.get.js

import { defineEventHandler, createError, getRequestHeader } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) {
    throw createError({ statusCode: 422, statusMessage: 'Missing cToon ID' })
  }

  // Require auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Find the last 3 closed, successfully sold auctions for this cToon
  const recent = await prisma.auction.findMany({
    where: {
      userCtoon: { ctoonId: id },
      status: 'CLOSED',
      winnerId: { not: null }
    },
    orderBy: { endAt: 'desc' },
    take: 3,
    select: {
      endAt: true,
      highestBid: true
    }
  })

  return recent.map(a => ({
    endedAt: a.endAt,
    soldFor: a.highestBid
  }))
})
