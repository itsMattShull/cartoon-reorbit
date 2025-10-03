import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // admin auth
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  // input
  const body = await readBody(event)
  const target = String(body?.target || '').trim()
  const sources = Array.isArray(body?.sources) ? body.sources.map(s => String(s || '').trim()).filter(Boolean) : []
  if (!target) throw createError({ statusCode: 400, statusMessage: 'target is required' })
  if (!sources.length) throw createError({ statusCode: 400, statusMessage: 'at least one source is required' })

  // users
  const users = await prisma.user.findMany({
    where: { username: { in: [target, ...sources] } },
    select: { id: true, username: true }
  })
  const idByName = new Map(users.map(u => [u.username, u.id]))
  const missing = [target, ...sources].filter(n => !idByName.has(n))
  if (missing.length) throw createError({ statusCode: 400, statusMessage: `Unknown username(s): ${missing.join(', ')}` })

  const targetId = idByName.get(target)
  const sourceIds = sources.map(n => idByName.get(n))

  // all UserCtoon ids ever owned by target
  const everRows = await prisma.ctoonOwnerLog.findMany({
    where: { userId: targetId, userCtoonId: { not: null } },
    select: { userCtoonId: true },
    distinct: ['userCtoonId']
  })
  const everIds = everRows.map(r => r.userCtoonId)
  if (everIds.length === 0) {
    return {
      target, sources,
      seedCount: 0,
      currentOwnedCount: 0,
      auctionPoints: 0,
      tradeValue: 0,
      bySource: {}
    }
  }

  // earliest owner per userCtoon
  const logs = await prisma.ctoonOwnerLog.findMany({
    where: { userCtoonId: { in: everIds } },
    select: { userCtoonId: true, userId: true, createdAt: true },
    orderBy: [{ userCtoonId: 'asc' }, { createdAt: 'asc' }]
  })
  const firstOwnerById = new Map()
  for (const row of logs) {
    if (!firstOwnerById.has(row.userCtoonId) && row.userId) {
      firstOwnerById.set(row.userCtoonId, row.userId)
    }
  }

  // seed = items that originated from any source and later were owned by target
  const seedIds = []
  const seedSourceNameById = new Map() // for breakdown
  for (const [uctId, ownerId] of firstOwnerById.entries()) {
    const idx = sourceIds.indexOf(ownerId)
    if (idx !== -1) {
      seedIds.push(uctId)
      seedSourceNameById.set(uctId, sources[idx])
    }
  }

  // current owned by target among seeds
  const currentOwnedCount = await prisma.userCtoon.count({
    where: { id: { in: seedIds }, userId: targetId, burnedAt: null }
  })

  // auction points received for these seeds (closed sales where target is creator)
  const auctionAgg = await prisma.auction.aggregate({
    where: {
      userCtoonId: { in: seedIds },
      status: 'CLOSED',
      creatorId: targetId,
      winnerId: { not: null }
    },
    _sum: { highestBid: true }
  })
  const auctionPoints = auctionAgg._sum.highestBid || 0

  const targetItems = seedIds.length
    ? await prisma.userCtoon.findMany({
        where: { id: { in: seedIds }, userId: targetId, burnedAt: null },
        select: {
          id: true,
          mintNumber: true,
          userId: true,
          user: { select: { username: true } },
          ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
        },
        orderBy: { createdAt: 'asc' }
      })
    : []

  const sourceItems = await prisma.userCtoon.findMany({
    where: { userId: { in: sourceIds }, burnedAt: null },
    select: {
      id: true,
      mintNumber: true,
      userId: true,
      user: { select: { username: true } },
      ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
    },
    orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }]
  })

  // trade value received for these seeds via accepted TradeOffers
  const initiated = await prisma.tradeOffer.findMany({
    where: {
      status: 'ACCEPTED',
      initiatorId: targetId,
      ctoons: { some: { role: 'OFFERED', userCtoonId: { in: seedIds } } }
    },
    select: { id: true, ctoons: { where: { role: 'REQUESTED' }, select: { userCtoon: { select: { ctoon: { select: { price: true } } } } } } }
  })
  const received = await prisma.tradeOffer.findMany({
    where: {
      status: 'ACCEPTED',
      recipientId: targetId,
      ctoons: { some: { role: 'REQUESTED', userCtoonId: { in: seedIds } } }
    },
    select: { id: true, ctoons: { where: { role: 'OFFERED' }, select: { userCtoon: { select: { ctoon: { select: { price: true } } } } } } }
  })
  const sumOffers = (arr) => arr.reduce((acc, o) => acc + o.ctoons.reduce((s, c) => s + (c.userCtoon?.ctoon?.price ?? 0), 0), 0)
  const tradeValue = sumOffers(initiated) + sumOffers(received)

  // optional per-source breakdown
  const bySource = {}
  if (seedIds.length) {
    // group seedIds by source name
    const idsBySource = {}
    for (const id of seedIds) {
      const name = seedSourceNameById.get(id) || 'unknown'
      if (!idsBySource[name]) idsBySource[name] = []
      idsBySource[name].push(id)
    }
    for (const [name, ids] of Object.entries(idsBySource)) {
      const owned = await prisma.userCtoon.count({ where: { id: { in: ids }, userId: targetId, burnedAt: null } })
      const aAgg = await prisma.auction.aggregate({
        where: { userCtoonId: { in: ids }, status: 'CLOSED', creatorId: targetId, winnerId: { not: null } },
        _sum: { highestBid: true }
      })
      const i2 = await prisma.tradeOffer.findMany({
        where: { status: 'ACCEPTED', initiatorId: targetId, ctoons: { some: { role: 'OFFERED', userCtoonId: { in: ids } } } },
        select: { id: true, ctoons: { where: { role: 'REQUESTED' }, select: { userCtoon: { select: { ctoon: { select: { price: true } } } } } } }
      })
      const r2 = await prisma.tradeOffer.findMany({
        where: { status: 'ACCEPTED', recipientId: targetId, ctoons: { some: { role: 'REQUESTED', userCtoonId: { in: ids } } } },
        select: { id: true, ctoons: { where: { role: 'OFFERED' }, select: { userCtoon: { select: { ctoon: { select: { price: true } } } } } } }
      })
      bySource[name] = {
        seedCount: ids.length,
        currentOwnedCount: owned,
        auctionPoints: aAgg._sum.highestBid || 0,
        tradeValue: sumOffers(i2) + sumOffers(r2)
      }
    }
  }

  return {
    target,
    sources,
    seedCount: seedIds.length,
    currentOwnedCount,
    auctionPoints,
    tradeValue,
    bySource,
    // NEW: preview payload for UI modal
    preview: {
      deactivationUsernames: sources,
      pointsToRemove: auctionPoints,
      targetItems,
      sourceItems
    }
  }
})
