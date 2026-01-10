// server/api/holiday/active.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Auth
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

  // 2) Find currently active event (time window & active flag)
  const now = new Date()
  const ev = await prisma.holidayEvent.findFirst({
    where: {
      isActive: true,
      startsAt: { lte: now },
      endsAt:   { gt:  now },
    },
    include: { items: true, poolEntries: true }
  })

  if (!ev) return null

  // 3) Pull full cToon details for the event's items
  const itemIds = ev.items.map(i => i.ctoonId)
  const ctoons = await prisma.ctoon.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      name: true,
      series: true,
      rarity: true,
      assetPath: true,
      price: true,
      quantity: true,      // null = unlimited
      inCmart: true,
      totalMinted: true // minted so far
    },
    orderBy: { name: 'asc' }
  })

  const shopCtoons = ctoons.map(c => ({
    id: c.id,
    name: c.name,
    series: c.series,
    rarity: c.rarity,
    assetPath: c.assetPath,
    price: c.price,
    quantity: c.quantity,
    minted: c.totalMinted ?? 0,
    inCmart: c.inCmart
  }))

  // 4) Shape response
  return {
    id: ev.id,
    name: ev.name,
    startsAt: ev.startsAt.toISOString(),
    endsAt: ev.endsAt.toISOString(),
    minRevealAt: ev.minRevealAt ? ev.minRevealAt.toISOString() : null,
    items: ev.items.map(i => ({ ctoonId: i.ctoonId })),
    poolEntries: ev.poolEntries.map(p => ({
      ctoonId: p.ctoonId,
      probabilityPercent: p.probabilityPercent
    })),
    shopCtoons
  }
})
