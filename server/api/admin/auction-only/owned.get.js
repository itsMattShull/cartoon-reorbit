// server/api/admin/auction-only/owned.get.js
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'

const OWNER_USERNAME = 'CartoonReOrbitOfficial'
const LIMIT = 25

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

  // query
  const { q = '' } = getQuery(event)
  const term = String(q).trim()
  if (term.length < 3) return []

  // owner
  const owner = await prisma.user.findUnique({
    where: { username: OWNER_USERNAME },
    select: { id: true }
  })
  if (!owner) throw createError({ statusCode: 404, statusMessage: 'Owner account not found' })

  // pending AuctionOnly userCtoonIds (isStarted = false)
  const pending = await prisma.auctionOnly.findMany({
    where: { isStarted: false },
    select: { userCtoonId: true }
  })
  const pendingSet = new Set(pending.map(p => p.userCtoonId))

  // 1) Owner inventory, excluding UserCtoons already scheduled
  const ownedRows = await prisma.userCtoon.findMany({
    where: {
      userId: owner.id,
      id: { notIn: Array.from(pendingSet) },
      ctoon: { name: { contains: term, mode: 'insensitive' } }
    },
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
    include: {
      ctoon: { select: { id: true, name: true, rarity: true, assetPath: true } }
    }
  })

  const owned = ownedRows.map(r => ({
    source: 'owned',
    userCtoonId: r.id,
    ctoonId: r.ctoon.id,
    name: r.ctoon.name,
    rarity: r.ctoon.rarity,
    assetPath: r.ctoon.assetPath
  }))
  const ownedCtoonIds = new Set(owned.map(x => x.ctoonId))

  // 2) Shop inventory with remaining stock:
  //    cToons where quantity IS NOT NULL and max(mintNumber) < quantity
  const stockCandidates = await prisma.ctoon.findMany({
    where: {
      name: { contains: term, mode: 'insensitive' },
      quantity: { not: null }
    },
    select: { id: true, name: true, rarity: true, assetPath: true, quantity: true },
    take: LIMIT * 2
  })

  const stockIds = stockCandidates.map(c => c.id)
  if (stockIds.length === 0) return [...owned].slice(0, LIMIT)

  const maxMint = await prisma.userCtoon.groupBy({
    by: ['ctoonId'],
    where: { ctoonId: { in: stockIds }, mintNumber: { not: null } },
    _max: { mintNumber: true }
  })
  const maxMap = new Map(maxMint.map(r => [r.ctoonId, r._max.mintNumber ?? 0]))

  const stock = stockCandidates
    .filter(c => !ownedCtoonIds.has(c.id))
    .filter(c => {
      const highest = Number(maxMap.get(c.id) || 0)
      const qty = Number(c.quantity)
      return Number.isFinite(qty) && highest < qty
    })
    .map(c => ({
      source: 'stock',
      userCtoonId: null,          // not owned yet
      ctoonId: c.id,
      name: c.name,
      rarity: c.rarity,
      assetPath: c.assetPath
    }))

  // 3) Merge (owned first), cap
  return [...owned, ...stock].slice(0, LIMIT)
})
